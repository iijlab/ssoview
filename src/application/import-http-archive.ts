/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpArchiveJson, parseHttpArchiveJson } from "@/core/http/http-archive.ts";
import { type HttpMessage, type HttpRequest, type HttpResponse } from "@/core/http/http-message.ts";
import { saveHttpMessage } from "@/core/http/http-message-repository.ts";
import { recordSamlLog } from "@/core/sso/saml-log-recorder.ts";
import { type SamlSignal } from "@/core/sso/saml-signal.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/core/sso/saml-signal-detector.ts";
import { newArchiveImportedEvent } from "@/core/tracing/tracing-event.ts";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";

/**
 * Import SSO flows from an HTTP archive JSON string.
 *
 * A single archive may contain multiple flows.
 *
 * @param httpArchiveJson - The HTTP archive JSON string to import
 * @returns An array of imported SSO flow IDs, or an Error if import fails
 */
export async function importHttpArchive(
  httpArchiveJson: HttpArchiveJson,
): Promise<string[] | Error> {
  const httpArchive = parseHttpArchiveJson(httpArchiveJson);
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

  // Ideally we could just save all imported logs, but because the storage key
  // uses the session ID, we first parse the logs to detect the session ID.
  // As a side effect, just like during traffic capture, we must handle the
  // missed first resource request.

  const ssoFlowIds = new Set<string>();

  for (const httpMessage of httpMessages) {
    const pairedHttpRequest =
      httpMessage.type === "Response" ? getPairedHttpRequest(httpMessage, httpMessages) : undefined;

    const samlSignal = await detectSamlSignal(httpMessage, pairedHttpRequest);
    if (samlSignal instanceof Error) {
      console.error("Failed to detect SAML signal from HTTP message:", samlSignal);
      continue;
    } else if (!samlSignal) {
      continue;
    }

    if (pairedHttpRequest !== undefined) {
      const saveError = await saveHttpMessage(pairedHttpRequest);
      if (saveError) {
        return saveError;
      }
    }

    const saveError = await saveHttpMessage(httpMessage);
    if (saveError) {
      return saveError;
    }

    const ssoTrace = await recordSamlLog(
      tracingSessionId,
      samlSignal,
      httpMessage,
      pairedHttpRequest,
    );
    if (ssoTrace instanceof Error) {
      return ssoTrace;
    }

    ssoFlowIds.add(ssoTrace.id);
  }

  return [...ssoFlowIds];
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

function getPairedHttpRequest(
  httpResponse: HttpResponse,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === httpResponse.pairedHttpRequestId);
  return pairedHttpRequest?.type === "Request" ? pairedHttpRequest : undefined;
}
