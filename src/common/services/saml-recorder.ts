/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SsoTrace, newSsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpMessage, type HttpRequest } from "@/common/models/http-message.ts";
import { type SamlSignal } from "@/common/models/saml-detection.ts";
import { debugSamlLog, newSamlLog } from "@/common/models/saml-trace.ts";
import { findSsoTraceByCorrelationKey, saveSsoTrace } from "@/common/services/flow-store.ts";
import { saveSamlLog } from "@/common/services/saml-store.ts";

export async function recordSamlLog(
  tracingSessionId: string,
  samlSignal: SamlSignal,
  httpMessage: HttpMessage,
  pairedHttpRequest?: HttpRequest,
): Promise<void | Error> {
  if (samlSignal.step === 2) {
    if (pairedHttpRequest === undefined) {
      console.warn("No paired HTTP request for the AuthnRequest, skipping step 1:", {
        correlationKey: samlSignal.correlationKey,
      });
    } else {
      const recordError = await recordSamlLog(
        tracingSessionId,
        {
          step: 1,
          correlationKey: samlSignal.correlationKey,
        },
        pairedHttpRequest,
      );
      if (recordError) {
        return recordError;
      }
    }
  }

  const ssoTrace = await getOrCreateSsoTrace(tracingSessionId, samlSignal.correlationKey);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  }

  const samlLog = newSamlLog(ssoTrace.id, samlSignal, httpMessage);
  if (samlLog instanceof Error) {
    return samlLog;
  }

  const saveError = await saveSamlLog(samlLog);
  if (saveError) {
    return saveError;
  }

  await debugSamlLog(samlLog);
}

async function getOrCreateSsoTrace(
  tracingSessionId: string,
  correlationKey: string,
): Promise<SsoTrace | Error> {
  const ssoTrace = await findSsoTraceByCorrelationKey(tracingSessionId, correlationKey);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  }

  return ssoTrace === undefined ? await createSsoTrace(tracingSessionId, correlationKey) : ssoTrace;
}

async function createSsoTrace(
  tracingSessionId: string,
  correlationKey: string,
): Promise<SsoTrace | Error> {
  const ssoTrace = newSsoTrace(tracingSessionId, "saml", correlationKey);

  const saveError = await saveSsoTrace(ssoTrace);
  if (saveError) {
    return saveError;
  }

  return ssoTrace;
}
