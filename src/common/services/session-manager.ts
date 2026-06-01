/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary, debugSessionSummary } from "@/common/models/session-summary.ts";
import { purgeHttpMessages } from "@/common/services/http-store.ts";
import { purgeSamlTraces, retrieveSamlTraces } from "@/common/services/saml-store.ts";
import { getSamlSessionSummary } from "@/common/services/saml-summarizer.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";

// NOTE: getSessionSummaries and getSessionSummary have known inefficiencies
// (e.g., repeated data fetches), but we prioritize simplicity as performance
// is not a concern at current scale.

/**
 * Retrieve summaries for all sessions associated with a tab.
 *
 * @param tabId - The tab ID to retrieve session summaries for
 * @returns An array of session summaries sorted by start time in descending order, or an Error
 */
export async function getSessionSummaries(tabId: number): Promise<SessionSummary[] | Error> {
  const sessionIds = await findSessionIds(tabId);
  if (sessionIds instanceof Error) {
    return sessionIds;
  }

  const summaries = await Promise.all(sessionIds.map((s) => getSessionSummary(tabId, s)));
  const err = summaries.find((s): s is Error => s instanceof Error);
  if (err !== undefined) {
    return err;
  }

  return summaries
    .filter((s): s is SessionSummary => !(s instanceof Error))
    .sort((a, b) => {
      if (a.start === undefined) return 1;
      if (b.start === undefined) return -1;
      // ISO 8601 format allows lexicographical sorting to match chronological order
      return b.start.localeCompare(a.start);
    });
}

async function findSessionIds(tabId: number): Promise<string[] | Error> {
  const samlTraces = await retrieveSamlTraces(tabId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  return [...new Set(samlTraces.map((m) => m.sessionId))];
}

/**
 * Retrieve the summary for a specific session.
 *
 * @param tabId - The tab ID associated with the session
 * @param sessionId - The session ID to retrieve the summary for
 * @returns The session summary, or an Error
 */
export async function getSessionSummary(
  tabId: number,
  sessionId: string,
): Promise<SessionSummary | Error> {
  const summary = await getSamlSessionSummary(tabId, sessionId);
  if (summary instanceof Error) {
    return summary;
  }

  const latestSessionId = await findLatestSessionId(tabId);
  if (latestSessionId instanceof Error) {
    return latestSessionId;
  }
  if (latestSessionId === undefined) {
    console.warn("Latest session ID not found:", { tabId });
  }

  const capturing = latestSessionId === sessionId && (await isAttached(tabId));
  if (capturing instanceof Error) {
    return capturing;
  }

  await debugSessionSummary({ ...summary, capturing });

  return { ...summary, capturing };
}

async function findLatestSessionId(tabId: number): Promise<string | undefined | Error> {
  const messages = await retrieveSamlTraces(tabId);
  if (messages instanceof Error) {
    return messages;
  }
  if (messages.length === 0) {
    return undefined;
  }

  const latest = messages.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));

  return latest.sessionId;
}

/**
 * Delete all data for a specific session.
 *
 * @param tabId - The tab ID associated with the session
 * @param sessionId - The session ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSession(tabId: number, sessionId: string): Promise<void | Error> {
  const samlPurgeResult = await purgeSamlTraces(tabId, sessionId);
  if (samlPurgeResult instanceof Error) {
    return samlPurgeResult;
  }

  const httpPurgeResult = await purgeHttpMessages(tabId, sessionId);
  if (httpPurgeResult instanceof Error) {
    // HTTP messages don't need to be purged, so we ignore failures
    console.warn("Failed to purge HTTP messages:", httpPurgeResult);
  }
}
