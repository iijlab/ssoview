/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { getTracingSessions, isTracing } from "@/common/services/capture-query.ts";
import { getHttpMessagesBySsoTraceId } from "@/common/services/flow-query.ts";
import {
  deleteSsoTrace,
  findAllSsoTraces,
  findSsoTraceById,
} from "@/common/services/flow-store.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import {
  deleteSamlLogsBySsoTraceId,
  findSamlLogsBySsoTraceId,
} from "@/common/services/saml-store.ts";
import { summarizeSamlFlow } from "@/common/services/saml-summarizer.ts";

// NOTE: getSessionSummaries has known inefficiencies (e.g., repeated data
// fetches), but we prioritize simplicity as performance is not a concern at
// current scale.

/**
 * Retrieve a summary of every flow in every tracing session.
 *
 * @param _tabId - Unused. Kept until the side panel stops passing it
 * @returns Flow summaries, newest first, or an Error
 */
export async function getSessionSummaries(_tabId: number): Promise<SessionSummary[] | Error> {
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

  const summaries: SessionSummary[] = [];
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

    const summary = {
      ...summarizeSamlFlow(ssoTrace, tracingSession, samlLogs),
      capturing: ssoTrace.id === ongoingSsoTraceId && tracing,
    };

    summaries.push(summary);
    await debugSessionSummary(summary);
  }

  return summaries;
}

/**
 * Delete all data for a specific SSO flow.
 *
 * @param _tabId - Unused. Kept until the side panel stops passing it
 * @param ssoTraceId - The SSO trace ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSession(_tabId: number, ssoTraceId: string): Promise<void | Error> {
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

  const samlDeleteError = await deleteSamlLogsBySsoTraceId(ssoTrace.id);
  if (samlDeleteError) {
    return samlDeleteError;
  }

  const ssoTraceDeleteError = await deleteSsoTrace(ssoTrace);
  if (ssoTraceDeleteError) {
    return ssoTraceDeleteError;
  }

  const httpDeleteError = await deleteHttpMessages(httpMessages);
  if (httpDeleteError) {
    // HTTP messages don't need to be deleted, so we ignore failures
    console.warn("Failed to delete HTTP messages:", httpDeleteError);
  }
}
