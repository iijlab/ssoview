/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type FlowEntry, newFlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage, type HttpRequest } from "@/common/models/http-message.ts";
import { type SamlSignal } from "@/common/models/saml-detection.ts";
import { debugSamlLog, newSamlLog } from "@/common/models/saml-trace.ts";
import { findFlowEntryByCorrelationKey, saveFlowEntry } from "@/common/services/flow-store.ts";
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

  const flowEntry = await findOrIssueFlowEntry(tracingSessionId, samlSignal.correlationKey);
  if (flowEntry instanceof Error) {
    return flowEntry;
  }

  const samlLog = newSamlLog(flowEntry.id, samlSignal, httpMessage);
  if (samlLog instanceof Error) {
    return samlLog;
  }

  const saveError = await saveSamlLog(samlLog);
  if (saveError) {
    return saveError;
  }

  await debugSamlLog(samlLog);
}

async function findOrIssueFlowEntry(
  tracingSessionId: string,
  correlationKey: string,
): Promise<FlowEntry | Error> {
  const flowEntry = await findFlowEntryByCorrelationKey(tracingSessionId, correlationKey);
  if (flowEntry instanceof Error) {
    return flowEntry;
  }

  return flowEntry === undefined
    ? await issueFlowEntry(tracingSessionId, correlationKey)
    : flowEntry;
}

async function issueFlowEntry(
  tracingSessionId: string,
  correlationKey: string,
): Promise<FlowEntry | Error> {
  const flowEntry = newFlowEntry(tracingSessionId, "saml", correlationKey);

  const saveError = await saveFlowEntry(flowEntry);
  if (saveError) {
    return saveError;
  }

  return flowEntry;
}
