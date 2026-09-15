/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";

export type SessionSummary = {
  protocol: SessionSsoProtocol;
  imported: boolean;
  capturing: boolean;
  sessionId: string;
  start?: string;
  end?: string;
  sp?: string;
  idp?: string;
  status?: SessionStatus;
  action?: string;
  warning: string[];
};

type SessionSsoProtocol = "saml" | "oidc";

type SessionStatus = "in_progress" | "succeeded" | "failed";

export function toSessionSummary(ssoFlow: SsoFlow): SessionSummary {
  const { id, live, startedAt, endedAt, ...rest } = ssoFlow;
  return { ...rest, capturing: live, sessionId: id, start: startedAt, end: endedAt };
}

export type SsoFlow = {
  id: string;
  protocol: SsoProtocol;
  imported: boolean;
  live: boolean;
  startedAt?: string;
  endedAt?: string;
  sp?: string;
  idp?: string;
  status?: SsoFlowStatus;
  action?: string;
  warning: string[];
};

type SsoProtocol = "saml" | "oidc";

type SsoFlowStatus = "in_progress" | "succeeded" | "failed";

//
// Debug utilities
//

export const debugSsoFlow =
  import.meta.env.MODE === "development" ? debugSsoFlowImpl : () => Promise.resolve();

async function debugSsoFlowImpl(ssoFlow: SsoFlow) {
  const debug = await newLabeledDebugLogger([
    "FLOW",
    ssoFlow.id,
    ssoFlow.sp ?? "unknown",
    ssoFlow.idp ?? "unknown",
    ssoFlow.startedAt ?? "not started",
    ssoFlow.endedAt ?? "ongoing",
    `${ssoFlow.status}`,
  ]);
  debug(ssoFlow.action, { SsoFlow: ssoFlow });
}
