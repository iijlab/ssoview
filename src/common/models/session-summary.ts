/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SsoFlow } from "@/core/sso/sso-flow.ts";

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
