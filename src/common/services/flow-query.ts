/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { findFlowEntryById } from "@/common/services/flow-store.ts";
import { findHttpMessagesByIds } from "@/common/services/http-store.ts";
import { findSamlTraces, findSamlTracesByFlowId } from "@/common/services/saml-store.ts";

export async function findHttpMessagesOfFlow(flowId: string): Promise<HttpMessage[] | Error> {
  const samlTraces = await findSamlTracesByFlowId(flowId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  const httpMessages = await findHttpMessagesByIds(samlTraces.map((t) => t.httpMessageId));
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const httpMessageIds = new Set(httpMessages.map((m) => m.id));

  const pairedHttpRequestIds = httpMessages.flatMap((m) =>
    m.stage === "Response" && !httpMessageIds.has(m.pairedHttpRequestId)
      ? [m.pairedHttpRequestId]
      : [],
  );

  const pairedHttpRequests = await findHttpMessagesByIds(pairedHttpRequestIds);
  if (pairedHttpRequests instanceof Error) {
    return pairedHttpRequests;
  }

  return [...httpMessages, ...pairedHttpRequests].toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

export async function findFlowEntriesByTabId(tabId: number): Promise<FlowEntry[] | Error> {
  const samlTraces = await findSamlTraces(tabId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  const flowIds = [...new Set(samlTraces.map((t) => t.flowId))].toSorted((a, b) =>
    a < b ? 1 : -1,
  );

  const flowEntries: FlowEntry[] = [];
  for (const flowId of flowIds) {
    const flowEntry = await findFlowEntryById(flowId);
    if (flowEntry instanceof Error) {
      return flowEntry;
    } else if (flowEntry === undefined) {
      console.warn("No flow entry for the traces:", { flowId });
      continue;
    }

    flowEntries.push(flowEntry);
  }

  return flowEntries;
}

export async function findFlowEntryByCorrelationKeyInTab(
  tabId: number,
  correlationKey: string,
): Promise<FlowEntry | undefined | Error> {
  const flowEntries = await findFlowEntriesByTabId(tabId);
  if (flowEntries instanceof Error) {
    return flowEntries;
  }

  return flowEntries.find((f) => f.correlationKey === correlationKey);
}
