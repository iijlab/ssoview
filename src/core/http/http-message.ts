/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { Base64 } from "js-base64";
import { v7 as uuidv7 } from "uuid";
import { newLabeledDebugLogger } from "@/shared/labeled-logger.ts";
import { isObject } from "@/shared/type-guard.ts";

export type HttpMessage = HttpRequest | HttpResponse;

export function isHttpMessage(u: unknown): u is HttpMessage {
  return isHttpRequest(u) || isHttpResponse(u);
}

type HttpMessageBase = {
  id: string;
  observedAt: string;
  tracingSessionId: string;
  tabId?: number;
  fetchRequestId?: Protocol.Fetch.RequestId;
  url: string;
  method: string;
  headers: Protocol.Fetch.HeaderEntry[];
  body: string | undefined;
};

function isHttpMessageBase(u: unknown): u is HttpMessageBase {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.observedAt === "string" &&
    typeof u.tracingSessionId === "string" &&
    (typeof u.tabId === "number" || u.tabId === undefined) &&
    (typeof u.fetchRequestId === "string" || u.fetchRequestId === undefined) &&
    typeof u.url === "string" &&
    typeof u.method === "string" &&
    isHeaderEntryArray(u.headers) &&
    (typeof u.body === "string" || u.body === undefined)
  );
}

function isHeaderEntryArray(u: unknown): u is Protocol.Fetch.HeaderEntry[] {
  return (
    Array.isArray(u) &&
    u.every(
      (entry) =>
        isObject(entry) && typeof entry.name === "string" && typeof entry.value === "string",
    )
  );
}

export type HttpRequest = HttpMessageBase & {
  type: "Request";
};

function isHttpRequest(u: unknown): u is HttpRequest {
  return isObject(u) && u.type === "Request" && isHttpMessageBase(u);
}

export type HttpResponse = HttpMessageBase & {
  type: "Response";
  statusCode: number;
  pairedHttpRequestId: string;
};

function isHttpResponse(u: unknown): u is HttpResponse {
  return (
    isObject(u) &&
    u.type === "Response" &&
    typeof u.statusCode === "number" &&
    typeof u.pairedHttpRequestId === "string" &&
    isHttpMessageBase(u)
  );
}

export function newHttpRequest(
  tracingSessionId: string,
  tabId: number,
  requestPausedEvent: Protocol.Fetch.RequestPausedEvent,
): HttpRequest {
  return {
    id: uuidv7(),
    observedAt: new Date().toISOString(),
    type: "Request",
    tracingSessionId,
    tabId,
    fetchRequestId: requestPausedEvent.requestId,
    url: requestPausedEvent.request.url,
    method: requestPausedEvent.request.method,
    headers: Object.entries(requestPausedEvent.request.headers).map(
      ([name, value]): Protocol.Fetch.HeaderEntry => ({ name, value }),
    ),
    body: extractRequestBody(requestPausedEvent.request),
  };
}

export function newHttpResponse(
  tracingSessionId: string,
  tabId: number,
  requestPausedEvent: Protocol.Fetch.RequestPausedEvent,
  statusCode: number,
  getResponseBodyResponse: Protocol.Network.GetResponseBodyResponse | undefined,
  httpRequest: HttpRequest,
): HttpResponse {
  const body =
    getResponseBodyResponse === undefined
      ? undefined
      : getResponseBodyResponse.base64Encoded
        ? Base64.decode(getResponseBodyResponse.body)
        : getResponseBodyResponse.body;

  return {
    id: uuidv7(),
    observedAt: new Date().toISOString(),
    type: "Response",
    tracingSessionId,
    tabId,
    fetchRequestId: requestPausedEvent.requestId,
    url: requestPausedEvent.request.url,
    method: requestPausedEvent.request.method,
    headers: requestPausedEvent.responseHeaders ?? [],
    body,
    statusCode,
    pairedHttpRequestId: httpRequest.id,
  };
}

function extractRequestBody(request: Protocol.Network.Request): string {
  if (!request.hasPostData || request.postDataEntries === undefined) {
    return "";
  }

  return request.postDataEntries
    .flatMap((e) => (e.bytes !== undefined ? [Base64.decode(e.bytes)] : []))
    .join("");
}

export function getHeaderValue(httpMessage: HttpMessage, key: string): string | undefined {
  const normalizedKey = key.toLowerCase();
  return httpMessage.headers.find((h) => h.name.toLowerCase() === normalizedKey)?.value;
}

//
// Debug utilities
//

export const debugHttpMessage =
  import.meta.env.MODE === "development" ? debugHttpMessageImpl : () => Promise.resolve();

async function debugHttpMessageImpl(httpMessage: HttpMessage): Promise<void> {
  return httpMessage.type === "Request"
    ? debugHttpRequestImpl(httpMessage)
    : debugHttpResponseImpl(httpMessage);
}

export const debugHttpRequest =
  import.meta.env.MODE === "development" ? debugHttpRequestImpl : () => Promise.resolve();

async function debugHttpRequestImpl(httpRequest: HttpRequest) {
  const host = getHostname(httpRequest.url);
  if (host instanceof Error) {
    console.warn("Failed to get hostname:", host);
    return;
  }

  const debug = await newLabeledDebugLogger([
    "HTTP",
    httpRequest.fetchRequestId ?? "none",
    host,
    httpRequest.method,
  ]);
  debug(httpRequest.url, { body: httpRequest.body, HttpRequest: httpRequest });
}

export const debugHttpResponse =
  import.meta.env.MODE === "development" ? debugHttpResponseImpl : () => Promise.resolve();

async function debugHttpResponseImpl(httpResponse: HttpResponse) {
  const host = getHostname(httpResponse.url);
  if (host instanceof Error) {
    console.warn("Failed to get hostname:", host);
    return;
  }

  const location = getHeaderValue(httpResponse, "Location");

  const debug = await newLabeledDebugLogger([
    "HTTP",
    httpResponse.fetchRequestId ?? "none",
    host,
    `${httpResponse.statusCode}`,
  ]);
  debug({ body: httpResponse.body, location, HttpResponse: httpResponse });
}

function getHostname(url: string): string | Error {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return new Error("Failed to extract hostname from url", { cause: err });
  }
}
