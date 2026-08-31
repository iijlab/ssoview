/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newArchiveImportedRecord } from "@/common/models/event-record.ts";
import { newHar, toHttpMessages } from "@/common/models/http-archive.ts";
import {
  type HttpMessage,
  type HttpRequest,
  type HttpResponse,
} from "@/common/models/http-message.ts";
import { type SamlDetection } from "@/common/models/saml-detection.ts";
import { newSamlTrace } from "@/common/models/saml-trace.ts";
import { saveEventRecord } from "@/common/services/event-store.ts";
import { retrieveHttpMessages, storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
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

  const saveError = await saveEventRecord(newArchiveImportedRecord());
  if (saveError) {
    return saveError;
  }

  // Ideally we could just store all imported logs, but because the storage key
  // uses the session ID, we first parse the logs to detect the session ID.
  // As a side effect, just like during traffic capture, we must handle the
  // missed first resource request.

  const sessionIds = new Set<string>();

  for (const httpMessage of httpMessages) {
    const detection = await detectSamlStep(httpMessage, httpMessages);
    if (detection instanceof Error) {
      console.error("Failed to detect SAML flow from HTTP message:", detection);
      continue;
    } else if (!detection) {
      continue;
    }

    const importedHttpMessage = {
      ...httpMessage,
      imported: true,
    };

    const samlTrace = newSamlTrace(detection, importedHttpMessage);
    if (samlTrace instanceof Error) {
      console.error("Failed to build SAML trace from HTTP message:", samlTrace);
      continue;
    }

    if (httpMessage.stage === "Response") {
      const pairedHttpRequest = findPairedHttpRequest(httpMessage, httpMessages);
      if (pairedHttpRequest !== undefined) {
        const httpStoreError = await storeHttpMessage(
          { ...pairedHttpRequest, imported: true },
          tabId,
          detection.correlationKey,
        );
        if (httpStoreError) {
          return httpStoreError;
        }
      }
    }

    const httpStoreError = await storeHttpMessage(
      importedHttpMessage,
      tabId,
      detection.correlationKey,
    );
    if (httpStoreError) {
      return httpStoreError;
    }

    const samlStoreError = await storeSamlTrace(samlTrace, tabId);
    if (samlStoreError) {
      return samlStoreError;
    }

    sessionIds.add(detection.correlationKey);
  }

  return [...sessionIds];
}

async function detectSamlStep(
  httpMessage: HttpMessage,
  httpMessages: HttpMessage[],
): Promise<SamlDetection | undefined | Error> {
  if (httpMessage.stage === "Request") {
    return detectSamlStepFromHttpRequest(httpMessage);
  } else {
    const pairedHttpRequest = findPairedHttpRequest(httpMessage, httpMessages);
    if (pairedHttpRequest === undefined) {
      return new Error(`No paired HTTP request for HTTP response: ${httpMessage.id}`);
    }

    return detectSamlStepFromHttpResponse(httpMessage, pairedHttpRequest);
  }
}

function findPairedHttpRequest(
  httpResponse: HttpResponse,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === httpResponse.pairedHttpRequestId);
  return pairedHttpRequest?.stage === "Request" ? pairedHttpRequest : undefined;
}
