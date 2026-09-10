/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type TracingSession } from "@/common/models/capture-session.ts";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { type SsoFlow } from "@/common/models/session-summary.ts";

export function deriveSsoFlowFromSamlLogs(
  ssoTrace: SsoTrace,
  tracingSession: TracingSession,
  samlLogs: SamlLog[],
): SsoFlow {
  return samlLogs.reduce(updateSsoFlow, {
    id: ssoTrace.id,
    protocol: "saml",
    imported: tracingSession.imported,
    live: false,
    warning: [],
  });
}

function updateSsoFlow(ssoFlow: SsoFlow, samlLog: SamlLog): SsoFlow {
  const status = (() => {
    if (ssoFlow.status === "failed") {
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
    ...ssoFlow,
    startedAt: ssoFlow.startedAt ?? samlLog.observedAt,
    endedAt: ssoFlow.endedAt ?? (status !== "in_progress" ? samlLog.observedAt : undefined),
    sp: ssoFlow.sp ?? (role === "sp" ? samlLog.serverHostname : undefined),
    idp: ssoFlow.idp ?? (role === "idp" ? samlLog.serverHostname : undefined),
    status,
    action: samlLog.action,
    warning: [...ssoFlow.warning, ...warning],
  };
}
