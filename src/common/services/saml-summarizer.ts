/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";

export function summarizeSamlFlow(
  flowEntry: FlowEntry,
  captureSession: CaptureSession,
  samlTraces: SamlTrace[],
): SessionSummary {
  const summary = summarizeSamlSession(flowEntry.correlationKey, samlTraces);
  return {
    ...summary,
    imported: captureSession.imported,
  };
}

export function summarizeSamlSession(sessionId: string, samlTraces: SamlTrace[]): SessionSummary {
  return samlTraces.reduce(updateSamlSessionSummary, {
    protocol: "saml",
    imported: false,
    capturing: false,
    sessionId,
    warning: [],
  });
}

function updateSamlSessionSummary(summary: SessionSummary, samlTrace: SamlTrace): SessionSummary {
  const status = (() => {
    if (summary.status === "failed") {
      return "failed";
    } else {
      switch (samlTrace.step) {
        case 4:
        case 5:
          if (!samlTrace.samlStatusCode.endsWith(":Success")) {
            return "failed";
          }
          break;
        case 6:
          return "succeeded";
      }
      return "in_progress";
    }
  })();

  const role = samlTrace.step === 3 || samlTrace.step === 4 ? "idp" : "sp";

  const warning: string[] = [];

  return {
    ...summary,
    imported: summary.imported || samlTrace.imported,
    start: summary.start ?? samlTrace.observedAt,
    end: summary.end ?? (status !== "in_progress" ? samlTrace.observedAt : undefined),
    sp: summary.sp ?? (role === "sp" ? samlTrace.serverHostname : undefined),
    idp: summary.idp ?? (role === "idp" ? samlTrace.serverHostname : undefined),
    status,
    action: samlTrace.action,
    warning: [...summary.warning, ...warning],
  };
}
