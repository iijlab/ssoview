/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type HttpRequest,
  type HttpResponse,
  debugHttpRequest,
  debugHttpResponse,
} from "@/core/http/http-message.ts";
import { deleteHttpMessages, saveHttpMessage } from "@/core/http/http-message-repository.ts";
import { recordSamlLog } from "@/core/sso/saml-log-recorder.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/core/sso/saml-signal-detector.ts";

export async function ingestHttpRequest(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpRequest(httpRequest);

  const saveError = await saveHttpMessage(httpRequest);
  if (saveError) {
    return saveError;
  }

  const samlSignal = await detectSamlSignalFromHttpRequest(httpRequest);
  if (samlSignal instanceof Error) {
    return samlSignal;
  } else if (!samlSignal) {
    return undefined;
  }

  const ssoTrace = await recordSamlLog(httpRequest.tracingSessionId, samlSignal, httpRequest);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  }

  return ssoTrace.id;
}

export async function ingestHttpResponse(
  httpResponse: HttpResponse,
  pairedHttpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpResponse(httpResponse);

  const samlSignal = await detectSamlSignalFromHttpResponse(httpResponse, pairedHttpRequest);
  if (samlSignal instanceof Error) {
    return samlSignal;
  } else if (!samlSignal) {
    // The response is not saved, so keep the request only if it is a step itself
    const shouldKeep = await detectSamlSignalFromHttpRequest(pairedHttpRequest);
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

  const ssoTrace = await recordSamlLog(
    httpResponse.tracingSessionId,
    samlSignal,
    httpResponse,
    pairedHttpRequest,
  );
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  }

  return ssoTrace.id;
}
