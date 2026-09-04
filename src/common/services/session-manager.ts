/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { getCaptureSession } from "@/common/services/capture-query.ts";
import {
  findFlowEntriesByTabId,
  findFlowEntryByCorrelationKeyInTab,
  findHttpMessagesOfFlow,
} from "@/common/services/flow-query.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlTracesByFlowId, findSamlTracesByFlowId } from "@/common/services/saml-store.ts";
import { summarizeSamlFlow } from "@/common/services/saml-summarizer.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";

// NOTE: getSessionSummaries has known inefficiencies (e.g., repeated data
// fetches), but we prioritize simplicity as performance is not a concern at
// current scale.

/**
 * Retrieve summaries for all sessions associated with a tab.
 *
 * @param tabId - The tab ID to retrieve session summaries for
 * @returns An array of session summaries sorted by flow ID in descending order, or an Error
 */
export async function getSessionSummaries(tabId: number): Promise<SessionSummary[] | Error> {
  const attached = await isAttached(tabId);
  if (attached instanceof Error) {
    return attached;
  }

  const flowEntries = await findFlowEntriesByTabId(tabId);
  if (flowEntries instanceof Error) {
    return flowEntries;
  }

  const summaries: SessionSummary[] = [];
  for (const flowEntry of flowEntries) {
    const captureSession = await getCaptureSession(flowEntry.captureSessionId);
    if (captureSession instanceof Error) {
      return captureSession;
    } else if (captureSession === undefined) {
      console.warn("No capture session for the flow:", { flowId: flowEntry.id });
      continue;
    }

    const samlTraces = await findSamlTracesByFlowId(flowEntry.id);
    if (samlTraces instanceof Error) {
      return samlTraces;
    }

    const summary = {
      ...summarizeSamlFlow(flowEntry, captureSession, samlTraces),
      capturing: isOngoing(captureSession) && attached,
    };

    summaries.push(summary);
    await debugSessionSummary(summary);
  }

  return summaries;
}

function isOngoing(captureSession: CaptureSession): boolean {
  return !captureSession.imported && captureSession.endedAt === undefined;
}

/**
 * Delete all data for a specific session.
 *
 * @param tabId - The tab ID associated with the session
 * @param sessionId - The session ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSession(tabId: number, sessionId: string): Promise<void | Error> {
  const flowEntry = await findFlowEntryByCorrelationKeyInTab(tabId, sessionId);
  if (flowEntry instanceof Error) {
    return flowEntry;
  } else if (flowEntry === undefined) {
    console.warn("No flow to delete:", { tabId, sessionId });
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

  const httpDeleteError = await deleteHttpMessages(httpMessages);
  if (httpDeleteError) {
    // HTTP messages don't need to be deleted, so we ignore failures
    console.warn("Failed to delete HTTP messages:", httpDeleteError);
  }
}
