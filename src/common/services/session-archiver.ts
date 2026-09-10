/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newArchiveImportedEvent } from "@/common/models/event-record.ts";
import {
  type HttpArchiveJson,
  newHttpArchive,
  parseHttpArchive,
  toHttpArchiveJson,
} from "@/common/models/http-archive.ts";
import {
  type HttpMessage,
  type HttpRequest,
  type HttpResponse,
} from "@/common/models/http-message.ts";
import { type SamlSignal } from "@/common/models/saml-detection.ts";
import { saveTracingLifecycleEvent } from "@/common/services/event-store.ts";
import { getHttpMessagesBySsoTraceId } from "@/common/services/flow-query.ts";
import { findSsoTraceById } from "@/common/services/flow-store.ts";
import { saveHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlLog } from "@/common/services/saml-recorder.ts";

/**
 * Export SSO flow data as an HTTP Archive (HAR) JSON string.
 *
 * @param _tabId - Unused. Kept until the side panel stops passing it
 * @param ssoTraceId - The SSO trace ID to export
 * @returns The HAR JSON string, or an Error if retrieval fails
 */
export async function dumpSessionArchive(
  _tabId: number,
  ssoTraceId: string,
): Promise<HttpArchiveJson | Error> {
  const ssoTrace = await findSsoTraceById(ssoTraceId);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  } else if (ssoTrace === undefined) {
    return new Error("SSO trace not found");
  }

  const httpMessages = await getHttpMessagesBySsoTraceId(ssoTrace.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return toHttpArchiveJson(newHttpArchive(httpMessages));
}

/**
 * Import session data from an HTTP Archive (HAR) JSON string.
 *
 * A single archive may contain multiple sessions.
 *
 * @param _tabId - Unused. Kept until the side panel stops passing it
 * @param httpArchiveJson - The HAR JSON string to import
 * @returns An array of imported session IDs, or an Error if import fails
 */
export async function loadSessionArchive(
  _tabId: number,
  httpArchiveJson: HttpArchiveJson,
): Promise<string[] | Error> {
  const httpArchive = parseHttpArchive(httpArchiveJson);
  if (httpArchive instanceof Error) {
    return httpArchive;
  }

  const archiveImportedEvent = newArchiveImportedEvent();
  const tracingSessionId = archiveImportedEvent.id;

  const saveError = await saveTracingLifecycleEvent(archiveImportedEvent);
  if (saveError) {
    return saveError;
  }

  const httpMessages = httpArchive.httpMessages.map(({ tabId, fetchRequestId, ...m }) => ({
    ...m,
    tracingSessionId,
  }));

  // Ideally we could just store all imported logs, but because the storage key
  // uses the session ID, we first parse the logs to detect the session ID.
  // As a side effect, just like during traffic capture, we must handle the
  // missed first resource request.

  const sessionIds = new Set<string>();

  for (const httpMessage of httpMessages) {
    const pairedHttpRequest =
      httpMessage.type === "Response"
        ? findPairedHttpRequest(httpMessage, httpMessages)
        : undefined;

    const samlSignal = await detectSamlSignal(httpMessage, pairedHttpRequest);
    if (samlSignal instanceof Error) {
      console.error("Failed to detect SAML signal from HTTP message:", samlSignal);
      continue;
    } else if (!samlSignal) {
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

    const recordError = await recordSamlLog(
      tracingSessionId,
      samlSignal,
      httpMessage,
      pairedHttpRequest,
    );
    if (recordError) {
      return recordError;
    }

    sessionIds.add(samlSignal.correlationKey);
  }

  return [...sessionIds];
}

async function detectSamlSignal(
  httpMessage: HttpMessage,
  pairedHttpRequest: HttpRequest | undefined,
): Promise<SamlSignal | undefined | Error> {
  if (httpMessage.type === "Request") {
    return detectSamlSignalFromHttpRequest(httpMessage);
  } else {
    if (pairedHttpRequest === undefined) {
      return new Error(`No paired HTTP request for HTTP response: ${httpMessage.id}`);
    }

    return detectSamlSignalFromHttpResponse(httpMessage, pairedHttpRequest);
  }
}

function findPairedHttpRequest(
  httpResponse: HttpResponse,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === httpResponse.pairedHttpRequestId);
  return pairedHttpRequest?.type === "Request" ? pairedHttpRequest : undefined;
}
