/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { findHttpMessagesByIds } from "@/common/services/http-store.ts";
import { findSamlLogsBySsoTraceId } from "@/common/services/saml-store.ts";

export async function getHttpMessagesBySsoTraceId(
  ssoTraceId: string,
): Promise<HttpMessage[] | Error> {
  const samlLogs = await findSamlLogsBySsoTraceId(ssoTraceId);
  if (samlLogs instanceof Error) {
    return samlLogs;
  }

  const httpMessages = await findHttpMessagesByIds(samlLogs.map((l) => l.httpMessageId));
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const httpMessageIds = new Set(httpMessages.map((m) => m.id));

  const pairedHttpRequestIds = httpMessages.flatMap((m) =>
    m.type === "Response" && !httpMessageIds.has(m.pairedHttpRequestId)
      ? [m.pairedHttpRequestId]
      : [],
  );

  const pairedHttpRequests = await findHttpMessagesByIds(pairedHttpRequestIds);
  if (pairedHttpRequests instanceof Error) {
    return pairedHttpRequests;
  }

  return [...httpMessages, ...pairedHttpRequests].toSorted((a, b) => (a.id < b.id ? -1 : 1));
}
