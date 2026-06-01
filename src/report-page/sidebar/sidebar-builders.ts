/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { getHttpStatusText } from "@/report-page/common/utils.ts";

//
// SequenceDiagram
//

type HttpMessageData = {
  timestamp: string;
  description: string;
  from: "user" | "sp" | "idp";
  to: "user" | "sp" | "idp";
  statusCode?: number;
};

export function buildHttpMessageDataRecord(
  spHost: string,
  idpHost: string,
  httpMessageRecord: Record<number, HttpMessage>,
): Record<number, HttpMessageData> {
  return Object.fromEntries(
    Object.entries(httpMessageRecord).map(([step, httpMessage]) => [
      step,
      buildHttpMessageData(spHost, idpHost, httpMessage),
    ]),
  );
}

function buildHttpMessageData(
  spHost: string,
  idpHost: string,
  httpMessage: HttpMessage,
): HttpMessageData {
  const isRequest = httpMessage.stage === "Request";
  const url = (() => {
    try {
      return new URL(httpMessage.url);
    } catch (err) {
      console.warn("Failed to parse url:", { error: err, url: httpMessage.url });
      return new URL("https://example.com/unknown.html");
    }
  })();
  const peer = url.hostname === idpHost ? "idp" : "sp";
  if (peer === "sp" && url.hostname !== spHost) {
    console.info("Host not matched to SP or IdP:", url.hostname);
  }

  return {
    timestamp: httpMessage.createdAt,
    description: isRequest
      ? `${httpMessage.method} ${url.pathname}${url.search}`
      : `${httpMessage.statusCode} ${getHttpStatusText(httpMessage.statusCode)}`,
    from: isRequest ? "user" : peer,
    to: isRequest ? peer : "user",
    statusCode: isRequest ? undefined : httpMessage.statusCode,
  };
}
