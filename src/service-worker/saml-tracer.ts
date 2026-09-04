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
import { deleteHttpMessages, saveHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";

export async function processHttpRequest(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpRequest(httpRequest);

  const saveError = await saveHttpMessage(httpRequest);
  if (saveError) {
    return saveError;
  }

  const detection = await detectSamlStepFromHttpRequest(httpRequest);
  if (detection instanceof Error) {
    return detection;
  } else if (!detection) {
    return undefined;
  }

  const recordError = await recordSamlTrace(httpRequest.captureSessionId, detection, httpRequest);
  if (recordError) {
    return recordError;
  }

  return detection.correlationKey;
}

export async function processHttpResponse(
  httpResponse: HttpResponse,
  pairedHttpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpResponse(httpResponse);

  const detection = await detectSamlStepFromHttpResponse(httpResponse, pairedHttpRequest);
  if (detection instanceof Error) {
    return detection;
  } else if (!detection) {
    // The response is not saved, so keep the request only if it is a step itself
    const shouldKeep = await detectSamlStepFromHttpRequest(pairedHttpRequest);
    if (shouldKeep instanceof Error) {
      return shouldKeep;
    } else if (!shouldKeep) {
      const deleteError = await deleteHttpMessages([pairedHttpRequest]);
      if (deleteError) {
        return deleteError;
      }
    }

    return undefined;
  }

  const saveError = await saveHttpMessage(httpResponse);
  if (saveError) {
    return saveError;
  }

  const recordError = await recordSamlTrace(
    httpResponse.captureSessionId,
    detection,
    httpResponse,
    pairedHttpRequest,
  );
  if (recordError) {
    return recordError;
  }

  return detection.correlationKey;
}
