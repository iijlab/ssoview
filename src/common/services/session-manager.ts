/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { getCaptureSessions, isCapturing } from "@/common/services/capture-query.ts";
import { findHttpMessagesOfFlow } from "@/common/services/flow-query.ts";
import {
  deleteFlowEntry,
  findAllFlowEntries,
  findFlowEntryById,
} from "@/common/services/flow-store.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlTracesByFlowId, findSamlTracesByFlowId } from "@/common/services/saml-store.ts";
import { summarizeSamlFlow } from "@/common/services/saml-summarizer.ts";

// NOTE: getSessionSummaries has known inefficiencies (e.g., repeated data
// fetches), but we prioritize simplicity as performance is not a concern at
// current scale.

/**
 * Retrieve a summary of every flow in every capture session.
 *
 * @param _tabId - Unused. Kept until the side panel stops passing it
 * @returns Flow summaries, newest first, or an Error
 */
export async function getSessionSummaries(_tabId: number): Promise<SessionSummary[] | Error> {
  const capturing = await isCapturing();
  if (capturing instanceof Error) {
    return capturing;
  }

  const captureSessions = await getCaptureSessions();
  if (captureSessions instanceof Error) {
    return captureSessions;
  }

  const flowEntries = await findAllFlowEntries();
  if (flowEntries instanceof Error) {
    return flowEntries;
  }

  const ongoingCaptureSession = captureSessions.find((s) => !s.imported && s.endedAt === undefined);
  const ongoingFlowId =
    ongoingCaptureSession !== undefined
      ? flowEntries.find((f) => f.captureSessionId === ongoingCaptureSession.id)?.id
      : undefined;

  const summaries: SessionSummary[] = [];
  for (const flowEntry of flowEntries) {
    const captureSession = captureSessions.find((s) => s.id === flowEntry.captureSessionId);
    if (captureSession === undefined) {
      console.warn("No capture session for the flow:", { flowId: flowEntry.id });
      continue;
    }

    const samlTraces = await findSamlTracesByFlowId(flowEntry.id);
    if (samlTraces instanceof Error) {
      return samlTraces;
    }

    const summary = {
      ...summarizeSamlFlow(flowEntry, captureSession, samlTraces),
      capturing: flowEntry.id === ongoingFlowId && capturing,
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

  const samlDeleteError = await deleteSamlTracesByFlowId(flowEntry.id);
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
