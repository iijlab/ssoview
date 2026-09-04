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
import { saveEventRecord } from "@/common/services/event-store.ts";
import {
  findFlowEntryByCorrelationKeyInTab,
  findHttpMessagesOfFlow,
} from "@/common/services/flow-query.ts";
import { saveHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";

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
  const flowEntry = await findFlowEntryByCorrelationKeyInTab(tabId, sessionId);
  if (flowEntry instanceof Error) {
    return flowEntry;
  } else if (flowEntry === undefined) {
    return new Error("Flow not found");
  }

  const httpMessages = await findHttpMessagesOfFlow(flowEntry.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return newHar(httpMessages);
}

/**
 * Import session data from an HTTP Archive (HAR) JSON string.
 *
 * A single archive may contain multiple sessions.
 *
 * @param tabId - The tab ID to associate with imported sessions
 * @param har - The HAR JSON string to import
 * @returns An array of imported session IDs, or an Error if import fails
 */
export async function loadSessionArchive(tabId: number, har: string): Promise<string[] | Error> {
  const archivedHttpMessages = toHttpMessages(har);
  if (archivedHttpMessages instanceof Error) {
    return archivedHttpMessages;
  }

  const archiveImportedRecord = newArchiveImportedRecord();
  const captureSessionId = archiveImportedRecord.id;

  const saveError = await saveEventRecord(archiveImportedRecord);
  if (saveError) {
    return saveError;
  }

  const httpMessages = archivedHttpMessages.map(({ tabId, fetchRequestId, ...m }) => ({
    ...m,
    captureSessionId,
  }));

  // Ideally we could just store all imported logs, but because the storage key
  // uses the session ID, we first parse the logs to detect the session ID.
  // As a side effect, just like during traffic capture, we must handle the
  // missed first resource request.

  const sessionIds = new Set<string>();

  for (const httpMessage of httpMessages) {
    const pairedHttpRequest =
      httpMessage.stage === "Response"
        ? findPairedHttpRequest(httpMessage, httpMessages)
        : undefined;

    const detection = await detectSamlStep(httpMessage, pairedHttpRequest);
    if (detection instanceof Error) {
      console.error("Failed to detect SAML flow from HTTP message:", detection);
      continue;
    } else if (!detection) {
      continue;
    }

    if (pairedHttpRequest !== undefined) {
      const httpStoreError = await saveHttpMessage(pairedHttpRequest);
      if (httpStoreError) {
        return httpStoreError;
      }
    }

    const httpStoreError = await saveHttpMessage(httpMessage);
    if (httpStoreError) {
      return httpStoreError;
    }

    const recordError = await recordSamlTrace(
      captureSessionId,
      tabId,
      detection,
      httpMessage,
      pairedHttpRequest,
    );
    if (recordError) {
      return recordError;
    }

    sessionIds.add(detection.correlationKey);
  }

  return [...sessionIds];
}

async function detectSamlStep(
  httpMessage: HttpMessage,
  pairedHttpRequest: HttpRequest | undefined,
): Promise<SamlDetection | undefined | Error> {
  if (httpMessage.stage === "Request") {
    return detectSamlStepFromHttpRequest(httpMessage);
  } else {
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
