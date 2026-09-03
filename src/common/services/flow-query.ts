/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { findHttpMessagesByIds } from "@/common/services/http-store.ts";
import { findSamlTraces } from "@/common/services/saml-store.ts";

export async function findHttpMessagesOfFlow(
  tabId: number,
  sessionId: string,
): Promise<HttpMessage[] | Error> {
  const httpMessages = await findTracedHttpMessages(tabId, sessionId);
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

async function findTracedHttpMessages(
  tabId: number,
  sessionId: string,
): Promise<HttpMessage[] | Error> {
  const samlTraces = await findSamlTraces(tabId);
  if (samlTraces instanceof Error) {
    return samlTraces;
  }

  const httpMessageIds = samlTraces
    .filter((t) => t.sessionId === sessionId)
    .map((t) => t.httpMessageId);

  return await findHttpMessagesByIds(httpMessageIds);
}
