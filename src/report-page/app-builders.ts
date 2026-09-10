/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { getTracingSession } from "@/common/services/capture-query.ts";
import { findHttpMessagesOfFlow } from "@/common/services/flow-query.ts";
import { findFlowEntryById } from "@/common/services/flow-store.ts";
import {
  extractSamlAuthnRequestXml,
  extractSamlResponseXml,
} from "@/common/services/saml-detector.ts";
import { findSamlLogsByFlowId } from "@/common/services/saml-store.ts";
import { type FlowData } from "@/report-page/common/types.ts";

export async function loadFlowData(flowId: string | null): Promise<FlowData | Error> {
  if (flowId === null) {
    // In development mode, fall back to sample data
    if (import.meta.env.MODE === "development") {
      const { buildSampleFlowData } = await import("@/report-page/dev/sample-flow.ts");
      return buildSampleFlowData();
    } else {
      return new Error("Invalid URL params");
    }
  }

  const flowEntry = await findFlowEntryById(flowId);
  if (flowEntry instanceof Error) {
    return flowEntry;
  } else if (flowEntry === undefined) {
    return new Error("Flow not found");
  }

  const tracingSession = await getTracingSession(flowEntry.tracingSessionId);
  if (tracingSession instanceof Error) {
    return tracingSession;
  } else if (tracingSession === undefined) {
    return new Error(`No tracing session: ${flowEntry.tracingSessionId}`);
  }

  const samlLogs = await findSamlLogsByFlowId(flowEntry.id);
  if (samlLogs instanceof Error) {
    return samlLogs;
  }

  const httpMessages = await findHttpMessagesOfFlow(flowEntry.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return { flowEntry, tracingSession, samlLogs, httpMessages };
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

  const authnRequestXml = await extractSamlAuthnRequestXml(httpMessage);
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

  const responseXml = await extractSamlResponseXml(httpMessage);
  if (responseXml instanceof Error) {
    console.warn("Failed to extract SAML Response XML:", responseXml);
    return undefined;
  }

  return responseXml;
}
