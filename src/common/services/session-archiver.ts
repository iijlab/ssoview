/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newHar, toHttpMessages } from "@/common/models/http-archive.ts";
import { retrieveHttpMessages, storeHttpMessage } from "@/common/services/http-store.ts";
import { detectSamlStep } from "@/common/services/saml-detector.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";

/**
 * Export session data as an HTTP Archive (HAR) JSON string.
 *
 * @param tabId - The tab ID associated with the session
 * @param sessionId - The session ID to export
 * @returns The HAR JSON string, or an Error if retrieval fails
 */
export async function dumpSessionArchive(
  tabId: number,
  sessionId: string,
): Promise<string | Error> {
  const httpMessages = await retrieveHttpMessages(tabId, sessionId);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return newHar(httpMessages);
}

/**
 * Import session data from an HTTP Archive (HAR) JSON string.
 *
 * Imported sessions are marked with the `imported` flag.
 * A single archive may contain multiple sessions.
 *
 * @param tabId - The tab ID to associate with imported sessions
 * @param har - The HAR JSON string to import
 * @returns An array of imported session IDs, or an Error if import fails
 */
export async function loadSessionArchive(tabId: number, har: string): Promise<string[] | Error> {
  const httpMessages = toHttpMessages(har);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  // Ideally we could just store all imported logs, but because the storage key
  // uses the session ID, we first parse the logs to detect the session ID.
  // As a side effect, just like during traffic capture, we must handle the
  // missed first resource request.

  const sessionIds = new Set<string>();

  for (const httpMessage of httpMessages) {
    const samlTrace = await detectSamlStep(httpMessage);
    if (samlTrace instanceof Error) {
      console.error("Failed to detect SAML flow from HTTP message:", samlTrace);
      continue;
    } else if (!samlTrace) {
      continue;
    }

    if (httpMessage.stage === "Response" && samlTrace.step === 2) {
      const storeHttpResult = await storeHttpMessage(
        httpMessage.request,
        tabId,
        samlTrace.sessionId,
      );
      if (storeHttpResult instanceof Error) {
        return storeHttpResult;
      }
    }

    const storeHttpResult = await storeHttpMessage(
      { ...httpMessage, imported: true },
      tabId,
      samlTrace.sessionId,
    );
    if (storeHttpResult instanceof Error) {
      return storeHttpResult;
    }

    const storeSamlResult = await storeSamlTrace({ ...samlTrace, imported: true }, tabId);
    if (storeSamlResult instanceof Error) {
      return storeSamlResult;
    }

    sessionIds.add(samlTrace.sessionId);
  }

  return [...sessionIds];
}
