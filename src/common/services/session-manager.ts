/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { getCaptureSession } from "@/common/services/capture-query.ts";
import { findFlowEntryById } from "@/common/services/flow-store.ts";
import { purgeHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlTraces, findSamlTraces } from "@/common/services/saml-store.ts";
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

  const samlTracesByFlowId = await findSamlTracesGroupedByFlowId(tabId);
  if (samlTracesByFlowId instanceof Error) {
    return samlTracesByFlowId;
  }

  const summaries: SessionSummary[] = [];
  for (const [flowId, samlTraces] of samlTracesByFlowId) {
    const flowEntry = await findFlowEntryById(flowId);
    if (flowEntry instanceof Error) {
      return flowEntry;
    } else if (flowEntry === undefined) {
      console.warn("No flow entry for the traces:", { flowId });
      continue;
    }

    const captureSession = await getCaptureSession(flowEntry.captureSessionId);
    if (captureSession instanceof Error) {
      return captureSession;
    } else if (captureSession === undefined) {
      console.warn("No capture session for the flow:", { flowId });
      continue;
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

async function findSamlTracesGroupedByFlowId(
  tabId: number,
): Promise<Map<string, SamlTrace[]> | Error> {
  const samlTraces = await findSamlTraces(tabId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  // TODO: Rewrite with Map.groupBy after raising the TypeScript target to ES2024 or later
  const samlTracesByFlowId = samlTraces.reduce((acc, trace) => {
    const current = acc.get(trace.flowId) ?? [];
    acc.set(trace.flowId, [...current, trace]);
    return acc;
  }, new Map<string, SamlTrace[]>());

  return new Map([...samlTracesByFlowId.entries()].toSorted(([a], [b]) => (a < b ? 1 : -1)));
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
  const samlDeleteError = await deleteSamlTraces(tabId, sessionId);
  if (samlDeleteError) {
    return samlDeleteError;
  }

  const httpPurgeError = await purgeHttpMessages(tabId, sessionId);
  if (httpPurgeError) {
    // HTTP messages don't need to be purged, so we ignore failures
    console.warn("Failed to purge HTTP messages:", httpPurgeError);
  }
}
