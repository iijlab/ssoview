/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { getTracingSessions, isTracing } from "@/common/services/capture-query.ts";
import { findHttpMessagesOfFlow } from "@/common/services/flow-query.ts";
import {
  deleteFlowEntry,
  findAllFlowEntries,
  findFlowEntryById,
} from "@/common/services/flow-store.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlLogsByFlowId, findSamlLogsByFlowId } from "@/common/services/saml-store.ts";
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

  const flowEntries = await findAllFlowEntries();
  if (flowEntries instanceof Error) {
    return flowEntries;
  }

  const ongoingTracingSession = tracingSessions.find((s) => !s.imported && s.endedAt === undefined);
  const ongoingFlowId =
    ongoingTracingSession !== undefined
      ? flowEntries.find((f) => f.tracingSessionId === ongoingTracingSession.id)?.id
      : undefined;

  const summaries: SessionSummary[] = [];
  for (const flowEntry of flowEntries) {
    const tracingSession = tracingSessions.find((s) => s.id === flowEntry.tracingSessionId);
    if (tracingSession === undefined) {
      console.warn("No tracing session for the flow:", { flowId: flowEntry.id });
      continue;
    }

    const samlLogs = await findSamlLogsByFlowId(flowEntry.id);
    if (samlLogs instanceof Error) {
      return samlLogs;
    }

    const summary = {
      ...summarizeSamlFlow(flowEntry, tracingSession, samlLogs),
      capturing: flowEntry.id === ongoingFlowId && tracing,
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
 * @param flowId - The flow ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSession(_tabId: number, flowId: string): Promise<void | Error> {
  const flowEntry = await findFlowEntryById(flowId);
  if (flowEntry instanceof Error) {
    return flowEntry;
  } else if (flowEntry === undefined) {
    console.warn("No flow to delete:", { flowId });
    return;
  }

  const httpMessages = await findHttpMessagesOfFlow(flowEntry.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const samlDeleteError = await deleteSamlLogsByFlowId(flowEntry.id);
  if (samlDeleteError) {
    return samlDeleteError;
  }

  const flowDeleteError = await deleteFlowEntry(flowEntry);
  if (flowDeleteError) {
    return flowDeleteError;
  }

  const httpDeleteError = await deleteHttpMessages(httpMessages);
  if (httpDeleteError) {
    // HTTP messages don't need to be deleted, so we ignore failures
    console.warn("Failed to delete HTTP messages:", httpDeleteError);
  }
}
