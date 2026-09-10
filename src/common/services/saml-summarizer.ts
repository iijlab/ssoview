/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type TracingSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";

export function summarizeSamlFlow(
  flowEntry: FlowEntry,
  tracingSession: TracingSession,
  samlLogs: SamlLog[],
): SessionSummary {
  return samlLogs.reduce(updateSamlSessionSummary, {
    protocol: "saml",
    imported: tracingSession.imported,
    capturing: false,
    sessionId: flowEntry.id,
    warning: [],
  });
}

function updateSamlSessionSummary(summary: SessionSummary, samlLog: SamlLog): SessionSummary {
  const status = (() => {
    if (summary.status === "failed") {
      return "failed";
    } else {
      switch (samlLog.step) {
        case 4:
        case 5:
          if (!samlLog.samlStatusCode.endsWith(":Success")) {
            return "failed";
          }
          break;
        case 6:
          return "succeeded";
      }
      return "in_progress";
    }
  })();

  const role = samlLog.step === 3 || samlLog.step === 4 ? "idp" : "sp";

  const warning: string[] = [];

  return {
    ...summary,
    start: summary.start ?? samlLog.observedAt,
    end: summary.end ?? (status !== "in_progress" ? samlLog.observedAt : undefined),
    sp: summary.sp ?? (role === "sp" ? samlLog.serverHostname : undefined),
    idp: summary.idp ?? (role === "idp" ? samlLog.serverHostname : undefined),
    status,
    action: samlLog.action,
    warning: [...summary.warning, ...warning],
  };
}
