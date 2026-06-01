/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { debugHttpMessage, type HttpMessage } from "@/common/models/http-message.ts";
import { debugSamlTrace } from "@/common/models/saml-trace.ts";
import { storeHttpMessage } from "@/common/services/http-store.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";
import { detectSamlStep } from "@/common/services/saml-detector.ts";

export async function processHttpMessage(
  tabId: number,
  httpMessage: HttpMessage,
): Promise<string | undefined | Error> {
  await debugHttpMessage(httpMessage);

  const detected = await detectSamlStep(httpMessage);
  if (detected instanceof Error) {
    return detected;
  } else if (!detected) {
    return undefined;
  }

  // Store the paired request for step=2 responses. This request is the initial
  // unauthenticated resource request (step=1) that triggered the SSO flow.
  if (httpMessage.stage === "Response" && detected.step === 2) {
    const storeHttpResult = await storeHttpMessage(httpMessage.request, tabId, detected.sessionId);
    if (storeHttpResult instanceof Error) {
      return storeHttpResult;
    }
  }

  const storeHttpResult = await storeHttpMessage(httpMessage, tabId, detected.sessionId);
  if (storeHttpResult instanceof Error) {
    return storeHttpResult;
  }

  const storeSamlResult = await storeSamlTrace(detected, tabId);
  if (storeSamlResult instanceof Error) {
    return storeSamlResult;
  }

  await debugSamlTrace(detected);

  return detected.sessionId;
}
