/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { getTracingSession } from "@/common/services/capture-query.ts";
import { getHttpMessagesBySsoTraceId } from "@/common/services/flow-query.ts";
import { findSsoTraceById } from "@/common/services/flow-store.ts";
import {
  extractSamlpAuthnRequestXml,
  extractSamlpResponseXml,
} from "@/common/services/saml-detector.ts";
import { findSamlLogsBySsoTraceId } from "@/common/services/saml-store.ts";
import { type FlowData } from "@/report-page/common/types.ts";

export async function loadFlowData(ssoTraceId: string | null): Promise<FlowData | Error> {
  if (ssoTraceId === null) {
    // In development mode, fall back to sample data
    if (import.meta.env.MODE === "development") {
      const { buildSampleFlowData } = await import("@/report-page/dev/sample-flow.ts");
      return buildSampleFlowData();
    } else {
      return new Error("Invalid URL params");
    }
  }

  const ssoTrace = await findSsoTraceById(ssoTraceId);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  } else if (ssoTrace === undefined) {
    return new Error("SSO trace not found");
  }

  const tracingSession = await getTracingSession(ssoTrace.tracingSessionId);
  if (tracingSession instanceof Error) {
    return tracingSession;
  } else if (tracingSession === undefined) {
    return new Error("Tracing session not found");
  }

  const samlLogs = await findSamlLogsBySsoTraceId(ssoTrace.id);
  if (samlLogs instanceof Error) {
    return samlLogs;
  }

  const httpMessages = await getHttpMessagesBySsoTraceId(ssoTrace.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return { ssoTrace, tracingSession, samlLogs, httpMessages };
}

export function buildHttpMessageRecord(
  samlLogs: SamlLog[],
  httpMessages: HttpMessage[],
): Record<number, HttpMessage> {
  const httpMessageRecord: Record<number, HttpMessage> = {};

  for (const samlLog of samlLogs) {
    if (samlLog.step in httpMessageRecord) {
      console.info("Duplicate SAML step, keeping the last one:", {
        step: samlLog.step,
        traceId: samlLog.id,
      });
    }

    const httpMessage = httpMessages.find((m) => m.id === samlLog.httpMessageId);
    if (httpMessage === undefined) {
      console.warn("No HTTP message for the SAML log:", {
        step: samlLog.step,
        httpMessageId: samlLog.httpMessageId,
      });
      continue;
    }

    httpMessageRecord[samlLog.step] = httpMessage;
  }

  return httpMessageRecord;
}

export async function getSamlAuthnRequestXml(
  httpMessageRecord: Record<number, HttpMessage>,
): Promise<string | undefined> {
  const httpMessage = httpMessageRecord[2] ?? httpMessageRecord[3];
  if (httpMessage === undefined) {
    return undefined;
  }

  const authnRequestXml = await extractSamlpAuthnRequestXml(httpMessage);
  if (authnRequestXml instanceof Error) {
    console.warn("Failed to extract SAML AuthnRequest XML:", authnRequestXml);
    return undefined;
  }

  return authnRequestXml;
}

export async function getSamlResponseXml(
  httpMessageRecord: Record<number, HttpMessage>,
): Promise<string | undefined> {
  const httpMessage = httpMessageRecord[4] ?? httpMessageRecord[5];
  if (httpMessage === undefined) {
    return undefined;
  }

  const responseXml = await extractSamlpResponseXml(httpMessage);
  if (responseXml instanceof Error) {
    console.warn("Failed to extract SAML Response XML:", responseXml);
    return undefined;
  }

  return responseXml;
}
