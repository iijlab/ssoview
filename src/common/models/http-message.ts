/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { Base64 } from "js-base64";
import { v7 as uuidv7 } from "uuid";
import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export type HttpMessage = HttpRequest | HttpResponse;

export function isHttpMessage(u: unknown): u is HttpMessage {
  return isHttpRequest(u) || isHttpResponse(u);
}

type HttpMessageBase = {
  id: string;
  createdAt: string;
  imported: boolean;
  fetchRequestId: Protocol.Fetch.RequestId;
  url: string;
  method: string;
  headers: Protocol.Fetch.HeaderEntry[];
  body: string | undefined;
};

function isHttpMessageBase(u: unknown): u is HttpMessageBase {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.createdAt === "string" &&
    typeof u.imported === "boolean" &&
    typeof u.fetchRequestId === "string" &&
    typeof u.url === "string" &&
    typeof u.method === "string" &&
    isHeaderEntries(u.headers) &&
    (typeof u.body === "string" || u.body === undefined)
  );
}

function isHeaderEntries(u: unknown): u is Protocol.Fetch.HeaderEntry[] {
  return (
    Array.isArray(u) &&
    u.every(
      (entry) =>
        isObject(entry) && typeof entry.name === "string" && typeof entry.value === "string",
    )
  );
}

export type HttpRequest = HttpMessageBase & {
  stage: "Request";
};

function isHttpRequest(u: unknown): u is HttpRequest {
  return isObject(u) && u.stage === "Request" && isHttpMessageBase(u);
}

export type HttpResponse = HttpMessageBase & {
  stage: "Response";
  statusCode: number;
  pairedHttpRequestId: string;
};

function isHttpResponse(u: unknown): u is HttpResponse {
  return (
    isObject(u) &&
    u.stage === "Response" &&
    typeof u.statusCode === "number" &&
    typeof u.pairedHttpRequestId === "string" &&
    isHttpMessageBase(u)
  );
}

export function newHttpRequest(requestPausedEvent: Protocol.Fetch.RequestPausedEvent): HttpRequest {
  return {
    id: uuidv7(),
    createdAt: new Date().toISOString(),
    imported: false,
    stage: "Request",
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
    createdAt: new Date().toISOString(),
    imported: false,
    stage: "Response",
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
  return httpMessage.stage === "Request"
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

  const debug = await createLabeledDebugLogger([
    "HTTP",
    httpRequest.fetchRequestId,
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

  const debug = await createLabeledDebugLogger([
    "HTTP",
    httpResponse.fetchRequestId,
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
