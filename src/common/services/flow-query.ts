/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { retrieveHttpMessages } from "@/common/services/http-store.ts";
import { findSamlTraces } from "@/common/services/saml-store.ts";

export async function findHttpMessagesOfFlow(
  tabId: number,
  sessionId: string,
): Promise<HttpMessage[] | Error> {
  const tabSamlTraces = await findSamlTraces(tabId);
  if (tabSamlTraces instanceof Error) {
    return tabSamlTraces;
  }

  const httpMessages = await retrieveHttpMessages(tabId, sessionId);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const httpMessageIds = new Set(
    tabSamlTraces.filter((t) => t.sessionId === sessionId).map((t) => t.httpMessageId),
  );
  const pairedHttpRequestIds = new Set(
    httpMessages.flatMap((m) =>
      m.stage === "Response" && httpMessageIds.has(m.id) ? [m.pairedHttpRequestId] : [],
    ),
  );

  return httpMessages.filter((m) => httpMessageIds.has(m.id) || pairedHttpRequestIds.has(m.id));
}
