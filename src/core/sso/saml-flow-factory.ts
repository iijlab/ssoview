/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SamlLog } from "@/core/sso/saml-log.ts";
import { type SsoFlow } from "@/core/sso/sso-flow.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { type TracingSession } from "@/core/tracing/tracing-session.ts";

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
      switch (samlLog.type) {
        case "IncomingSamlResponse":
        case "OutgoingSamlResponse":
          if (!samlLog.samlStatusCode.endsWith(":Success")) {
            return "failed";
          }
          break;
        case "AuthenticatedResourceResponse":
          return "succeeded";
      }
      return "in_progress";
    }
  })();

  const role =
    samlLog.type === "OutgoingSamlAuthnRequest" || samlLog.type === "IncomingSamlResponse"
      ? "idp"
      : "sp";

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
