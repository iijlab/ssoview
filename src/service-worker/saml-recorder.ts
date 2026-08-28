/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  debugHttpRequest,
  debugHttpResponse,
  type HttpRequest,
  type HttpResponse,
} from "@/common/models/http-message.ts";
import { debugSamlTrace } from "@/common/models/saml-trace.ts";
import { storeHttpMessage } from "@/common/services/http-store.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";

export async function processHttpRequest(
  tabId: number,
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpRequest(httpRequest);

  const detected = await detectSamlStepFromHttpRequest(httpRequest);
  if (detected instanceof Error) {
    return detected;
  } else if (!detected) {
    return undefined;
  }

  {
    const err = await storeHttpMessage(httpRequest, tabId, detected.sessionId);
    if (err) {
      return err;
    }
  }
  {
    const err = await storeSamlTrace(detected, tabId);
    if (err) {
      return err;
    }
  }

  await debugSamlTrace(detected);

  return detected.sessionId;
}

export async function processHttpResponse(
  tabId: number,
  httpResponse: HttpResponse,
  pairedHttpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  await debugHttpResponse(httpResponse);

  const detected = await detectSamlStepFromHttpResponse(httpResponse, pairedHttpRequest);
  if (detected instanceof Error) {
    return detected;
  } else if (!detected) {
    return undefined;
  }

  {
    const err = await storeHttpMessage(pairedHttpRequest, tabId, detected.sessionId);
    if (err) {
      return err;
    }
  }
  {
    const err = await storeHttpMessage(httpResponse, tabId, detected.sessionId);
    if (err) {
      return err;
    }
  }
  {
    const err = await storeSamlTrace(detected, tabId);
    if (err) {
      return err;
    }
  }

  await debugSamlTrace(detected);

  return detected.sessionId;
}
