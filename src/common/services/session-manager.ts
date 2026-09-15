/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary, toSessionSummary } from "@/common/models/session-summary.ts";
import { deleteHttpMessages } from "@/core/http/http-message-repository.ts";
import { deriveSsoFlowFromSamlLogs } from "@/core/sso/saml-flow-factory.ts";
import {
  deleteSamlLogsBySsoTraceId,
  findSamlLogsBySsoTraceId,
} from "@/core/sso/saml-log-repository.ts";
import { type SsoFlow, debugSsoFlow } from "@/core/sso/sso-flow.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import {
  deleteSsoTrace,
  findAllSsoTraces,
  findSsoTraceById,
} from "@/core/sso/sso-trace-repository.ts";
import { getTracingSessions } from "@/core/tracing/tracing-session-query.ts";
import { isTracing } from "@/core/tracing/tracing-state-query.ts";

// NOTE: getSsoFlows has known inefficiencies (e.g., repeated data fetches),
// but we prioritize simplicity as performance is not a concern at current
// scale.

/**
 * Retrieve every SSO flow in every tracing session.
 *
 * @returns SSO flows, newest first, or an Error
 */
export async function getSsoFlows(): Promise<SsoFlow[] | Error> {
  const tracing = await isTracing();
  if (tracing instanceof Error) {
    return tracing;
  }

  const tracingSessions = await getTracingSessions();
  if (tracingSessions instanceof Error) {
    return tracingSessions;
  }

  const ssoTraces = await findAllSsoTraces();
  if (ssoTraces instanceof Error) {
    return ssoTraces;
  }

  const ongoingTracingSession = tracingSessions.find((s) => !s.imported && s.endedAt === undefined);
  const ongoingSsoTraceId =
    ongoingTracingSession !== undefined
      ? ssoTraces.find((t) => t.tracingSessionId === ongoingTracingSession.id)?.id
      : undefined;

  const ssoFlows: SsoFlow[] = [];
  for (const ssoTrace of ssoTraces) {
    const tracingSession = tracingSessions.find((s) => s.id === ssoTrace.tracingSessionId);
    if (tracingSession === undefined) {
      console.warn("No tracing session for the SSO trace:", { ssoTraceId: ssoTrace.id });
      continue;
    }

    const samlLogs = await findSamlLogsBySsoTraceId(ssoTrace.id);
    if (samlLogs instanceof Error) {
      return samlLogs;
    }

    const ssoFlow = {
      ...deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, samlLogs),
      live: ssoTrace.id === ongoingSsoTraceId && tracing,
    };

    ssoFlows.push(ssoFlow);
    await debugSsoFlow(ssoFlow);
  }

  return ssoFlows;
}

/**
 * Delete all data for a specific SSO flow.
 *
 * @param ssoTraceId - The SSO trace ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSsoFlow(ssoTraceId: string): Promise<void | Error> {
  const ssoTrace = await findSsoTraceById(ssoTraceId);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  } else if (ssoTrace === undefined) {
    console.warn("No SSO trace to delete:", { ssoTraceId });
    return;
  }

  const httpMessages = await getHttpMessagesBySsoTraceId(ssoTrace.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const samlLogDeleteError = await deleteSamlLogsBySsoTraceId(ssoTrace.id);
  if (samlLogDeleteError) {
    return samlLogDeleteError;
  }

  const ssoTraceDeleteError = await deleteSsoTrace(ssoTrace);
  if (ssoTraceDeleteError) {
    return ssoTraceDeleteError;
  }

  const httpMessageDeleteError = await deleteHttpMessages(httpMessages);
  if (httpMessageDeleteError) {
    // HTTP messages don't need to be deleted, so we ignore failures
    console.warn("Failed to delete HTTP messages:", httpMessageDeleteError);
  }
}

export async function getSessionSummaries(_tabId: number): Promise<SessionSummary[] | Error> {
  const ssoFlows = await getSsoFlows();
  return ssoFlows instanceof Error ? ssoFlows : ssoFlows.map(toSessionSummary);
}

export async function deleteSession(_tabId: number, ssoTraceId: string): Promise<void | Error> {
  return await deleteSsoFlow(ssoTraceId);
}
