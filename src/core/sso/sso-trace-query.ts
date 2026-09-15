/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/core/http/http-message.ts";
import { findHttpMessagesByIds } from "@/core/http/http-message-repository.ts";
import { findSamlLogsBySsoTraceId } from "@/core/sso/saml-log-repository.ts";

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
