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
import { debugSamlTrace, newSamlTrace } from "@/common/models/saml-trace.ts";
import { storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";

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

  const samlTrace = newSamlTrace(detection, httpRequest);
  if (samlTrace instanceof Error) {
    return samlTrace;
  }

  const httpStoreError = await storeHttpMessage(httpRequest, tabId, detection.correlationKey);
  if (httpStoreError) {
    return httpStoreError;
  }

  const samlStoreError = await storeSamlTrace(samlTrace, tabId);
  if (samlStoreError) {
    return samlStoreError;
  }

  await debugSamlTrace(samlTrace);

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

  const samlTrace = newSamlTrace(detection, httpResponse);
  if (samlTrace instanceof Error) {
    return samlTrace;
  }

  const pairStoreError = await storeHttpMessage(pairedHttpRequest, tabId, detection.correlationKey);
  if (pairStoreError) {
    return pairStoreError;
  }

  const httpStoreError = await storeHttpMessage(httpResponse, tabId, detection.correlationKey);
  if (httpStoreError) {
    return httpStoreError;
  }

  const samlStoreError = await storeSamlTrace(samlTrace, tabId);
  if (samlStoreError) {
    return samlStoreError;
  }

  await debugSamlTrace(samlTrace);

  return detection.correlationKey;
}
