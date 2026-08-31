/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type FlowEntry, newFlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlDetection } from "@/common/models/saml-detection.ts";
import { debugSamlTrace, newSamlTrace } from "@/common/models/saml-trace.ts";
import { findFlowEntryByCorrelationKey, saveFlowEntry } from "@/common/services/flow-store.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";

export async function recordSamlTrace(
  captureSessionId: string,
  tabId: number,
  detection: SamlDetection,
  httpMessage: HttpMessage,
): Promise<void | Error> {
  const flowEntry = await findOrIssueFlowEntry(captureSessionId, detection.correlationKey);
  if (flowEntry instanceof Error) {
    return flowEntry;
  }

  const samlTrace = newSamlTrace(detection, httpMessage);
  if (samlTrace instanceof Error) {
    return samlTrace;
  }

  const storeError = await storeSamlTrace(samlTrace, tabId);
  if (storeError) {
    return storeError;
  }

  await debugSamlTrace(samlTrace);
}

async function findOrIssueFlowEntry(
  captureSessionId: string,
  correlationKey: string,
): Promise<FlowEntry | Error> {
  const flowEntry = await findFlowEntryByCorrelationKey(captureSessionId, correlationKey);
  if (flowEntry instanceof Error) {
    return flowEntry;
  }

  return flowEntry === undefined
    ? await issueFlowEntry(captureSessionId, correlationKey)
    : flowEntry;
}

async function issueFlowEntry(
  captureSessionId: string,
  correlationKey: string,
): Promise<FlowEntry | Error> {
  const flowEntry = newFlowEntry(captureSessionId, "saml", correlationKey);

  const saveError = await saveFlowEntry(flowEntry);
  if (saveError) {
    return saveError;
  }

  return flowEntry;
}
