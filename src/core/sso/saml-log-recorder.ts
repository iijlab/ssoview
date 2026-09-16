/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage, type HttpRequest } from "@/core/http/http-message.ts";
import { debugSamlLog, newSamlLog } from "@/core/sso/saml-log.ts";
import { saveSamlLog } from "@/core/sso/saml-log-repository.ts";
import { type SamlSignal } from "@/core/sso/saml-signal.ts";
import { type SsoTrace, newSsoTrace } from "@/core/sso/sso-trace.ts";
import { findSsoTraceByCorrelationKey, saveSsoTrace } from "@/core/sso/sso-trace-repository.ts";

export async function recordSamlLog(
  tracingSessionId: string,
  samlSignal: SamlSignal,
  httpMessage: HttpMessage,
  pairedHttpRequest?: HttpRequest,
): Promise<SsoTrace | Error> {
  if (samlSignal.type === "IncomingSamlAuthnRequest") {
    if (pairedHttpRequest === undefined) {
      console.warn("No paired HTTP request for the SAML AuthnRequest");
    } else {
      const ssoTrace = await recordSamlLog(
        tracingSessionId,
        {
          type: "UnauthenticatedResourceRequest",
          correlationKey: samlSignal.correlationKey,
        },
        pairedHttpRequest,
      );
      if (ssoTrace instanceof Error) {
        return ssoTrace;
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

  return ssoTrace;
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
