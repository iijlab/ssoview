/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { retrieveSamlTraces } from "@/common/services/saml-store.ts";

export async function getSamlSessionSummary(
  tabId: number,
  sessionId: string,
): Promise<SessionSummary | Error> {
  const samlTraces = await retrieveSamlTraces(tabId, sessionId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  if (samlTraces.length === 0) {
    return new Error("Session not found");
  }

  return summarizeSamlSession(sessionId, samlTraces);
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
      switch (samlTrace.type) {
        case "IncomingResponse":
        case "OutgoingResponse":
          if (!samlTrace.response.statusCode.endsWith(":Success")) {
            return "failed";
          }
          break;
        case "AuthenticatedResourceResponse":
          return "succeeded";
      }
      return "in_progress";
    }
  })();

  const warning: string[] = [];

  return {
    ...summary,
    imported: summary.imported || samlTrace.imported,
    start: summary.start ?? samlTrace.date,
    end: summary.end ?? (status !== "in_progress" ? samlTrace.date : undefined),
    sp: summary.sp ?? samlTrace.sp,
    idp: summary.idp ?? samlTrace.idp,
    status,
    action: samlTrace.action,
    warning: [...summary.warning, ...warning],
  };
}
