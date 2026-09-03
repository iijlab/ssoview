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
import { findPairedHttpRequest, saveHttpMessage } from "@/common/services/http-store.ts";
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

  const httpStoreError = await saveHttpMessage(httpRequest);
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

  const storedPairedHttpRequest = await findPairedHttpRequest(httpResponse);
  if (storedPairedHttpRequest instanceof Error) {
    return storedPairedHttpRequest;
  } else if (storedPairedHttpRequest === undefined) {
    const saveError = await saveHttpMessage(pairedHttpRequest);
    if (saveError) {
      return saveError;
    }
  }

  const httpRequest = storedPairedHttpRequest ?? pairedHttpRequest;
  const httpResponseToStore = {
    ...httpResponse,
    pairedHttpRequestId: httpRequest.id,
  };
  const saveError = await saveHttpMessage(httpResponseToStore);
  if (saveError) {
    return saveError;
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
