/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type HttpRequest,
  type HttpResponse,
  debugHttpRequest,
  debugHttpResponse,
} from "@/common/models/http-message.ts";
import { retrieveHttpMessages, storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";

export async function processHttpRequest(
  tabId: number,
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpRequest(httpRequest);

  const detection = await detectSamlStepFromHttpRequest(httpRequest);
  if (detection instanceof Error) {
    return detection;
  } else if (!detection) {
    return undefined;
  }

  const httpStoreError = await storeHttpMessage(httpRequest, tabId, detection.correlationKey);
  if (httpStoreError) {
    return httpStoreError;
  }

  const recordError = await recordSamlTrace(
    httpRequest.captureSessionId,
    tabId,
    detection,
    httpRequest,
  );
  if (recordError) {
    return recordError;
  }

  return detection.correlationKey;
}

export async function processHttpResponse(
  tabId: number,
  httpResponse: HttpResponse,
  pairedHttpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpResponse(httpResponse);

  const detection = await detectSamlStepFromHttpResponse(httpResponse, pairedHttpRequest);
  if (detection instanceof Error) {
    return detection;
  } else if (!detection) {
    return undefined;
  }

  const storedHttpMessages = await retrieveHttpMessages(tabId, detection.correlationKey);
  if (storedHttpMessages instanceof Error) {
    return storedHttpMessages;
  }

  const storedPairedHttpRequest = storedHttpMessages.find(
    (m): m is HttpRequest =>
      m.stage === "Request" && m.fetchRequestId === httpResponse.fetchRequestId,
  );

  const httpRequest = storedPairedHttpRequest ?? pairedHttpRequest;
  const httpResponseToStore =
    storedPairedHttpRequest === undefined
      ? httpResponse
      : { ...httpResponse, pairedHttpRequestId: storedPairedHttpRequest.id };

  if (storedPairedHttpRequest === undefined) {
    const pairStoreError = await storeHttpMessage(httpRequest, tabId, detection.correlationKey);
    if (pairStoreError) {
      return pairStoreError;
    }
  }

  const httpStoreError = await storeHttpMessage(
    httpResponseToStore,
    tabId,
    detection.correlationKey,
  );
  if (httpStoreError) {
    return httpStoreError;
  }

  const recordError = await recordSamlTrace(
    httpResponse.captureSessionId,
    tabId,
    detection,
    httpResponseToStore,
    httpRequest,
  );
  if (recordError) {
    return recordError;
  }

  return detection.correlationKey;
}
