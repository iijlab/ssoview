/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { deleteSsoFlow } from "@/application/delete-sso-flow.ts";
import { getSsoFlows } from "@/application/get-sso-flows.ts";
import { type SessionSummary, toSessionSummary } from "@/common/models/session-summary.ts";

export async function getSessionSummaries(_tabId: number): Promise<SessionSummary[] | Error> {
  const ssoFlows = await getSsoFlows();
  return ssoFlows instanceof Error ? ssoFlows : ssoFlows.map(toSessionSummary);
}

export async function deleteSession(_tabId: number, ssoTraceId: string): Promise<void | Error> {
  return await deleteSsoFlow(ssoTraceId);
}
