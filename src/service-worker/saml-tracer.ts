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
import { storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";
import { getOngoingCaptureSessionId } from "@/service-worker/capture-manager.ts";

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

  const captureSessionId = await getOngoingCaptureSessionId();
  if (captureSessionId instanceof Error) {
    return captureSessionId;
  } else if (captureSessionId === undefined) {
    console.warn("No ongoing capture session, skipping the HTTP request:", { tabId });
    return undefined;
  }

  const httpStoreError = await storeHttpMessage(httpRequest, tabId, detection.correlationKey);
  if (httpStoreError) {
    return httpStoreError;
  }

  const recordError = await recordSamlTrace(captureSessionId, tabId, detection, httpRequest);
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

  const captureSessionId = await getOngoingCaptureSessionId();
  if (captureSessionId instanceof Error) {
    return captureSessionId;
  } else if (captureSessionId === undefined) {
    console.warn("No ongoing capture session, skipping the HTTP response:", { tabId });
    return undefined;
  }

  const pairStoreError = await storeHttpMessage(pairedHttpRequest, tabId, detection.correlationKey);
  if (pairStoreError) {
    return pairStoreError;
  }

  const httpStoreError = await storeHttpMessage(httpResponse, tabId, detection.correlationKey);
  if (httpStoreError) {
    return httpStoreError;
  }

  const recordError = await recordSamlTrace(captureSessionId, tabId, detection, httpResponse);
  if (recordError) {
    return recordError;
  }

  return detection.correlationKey;
}
