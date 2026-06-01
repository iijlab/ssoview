/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { Base64 } from "js-base64";
import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export type HttpMessage = HttpRequest | HttpResponse;

export function isHttpMessage(u: unknown): u is HttpMessage {
  return isHttpRequest(u) || isHttpResponse(u);
}

export type HttpRequest = PendingHttpRequest | LoadedHttpRequest;

function isHttpRequest(u: unknown): u is HttpRequest {
  return isPendingHttpRequest(u) || isLoadedHttpRequest(u);
}

export type HttpResponse = PendingHttpResponse | LoadedHttpResponse;

function isHttpResponse(u: unknown): u is HttpResponse {
  return isPendingHttpResponse(u) || isLoadedHttpResponse(u);
}

type HttpMessageBase = {
  createdAt: string;
  imported: boolean;
  requestId: Protocol.Fetch.RequestId;
  resourceType: Protocol.Network.ResourceType;
  headers: Protocol.Fetch.HeaderEntry[];
  url: string;
  method: string;
};

function isHttpMessageBase(u: unknown): u is HttpMessageBase {
  return (
    isObject(u) &&
    typeof u.createdAt === "string" &&
    typeof u.imported === "boolean" &&
    typeof u.requestId === "string" &&
    typeof u.resourceType === "string" &&
    isHeaderEntries(u.headers) &&
    typeof u.url === "string" &&
    typeof u.method === "string"
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

type HttpRequestBase = HttpMessageBase & {
  stage: "Request";
};

function isHttpRequestBase(u: unknown): u is HttpRequestBase {
  return isObject(u) && u.stage === "Request" && isHttpMessageBase(u);
}

type HttpResponseBase = HttpMessageBase & {
  stage: "Response";
  statusCode: number;
};

function isHttpResponseBase(u: unknown): u is HttpResponseBase {
  return (
    isObject(u) &&
    u.stage === "Response" &&
    typeof u.statusCode === "number" &&
    isHttpMessageBase(u)
  );
}

type PendingHttpRequest = HttpRequestBase & {
  bodyStatus: "pending";
  getBody: () => Promise<string | Error>;
  _requestPausedEvent: Protocol.Fetch.RequestPausedEvent;
};

function isPendingHttpRequest(u: unknown): u is PendingHttpRequest {
  return (
    isObject(u) &&
    u.bodyStatus === "pending" &&
    typeof u.getBody === "function" &&
    isHttpRequestBase(u)
  );
}

type PendingHttpResponse = HttpResponseBase & {
  bodyStatus: "pending";
  request: PendingHttpRequest;
  getBody: () => Promise<string | Error>;
  _requestPausedEvent: Protocol.Fetch.RequestPausedEvent;
};

function isPendingHttpResponse(u: unknown): u is PendingHttpResponse {
  return (
    isObject(u) &&
    u.bodyStatus === "pending" &&
    typeof u.getBody === "function" &&
    isPendingHttpRequest(u.request) &&
    isHttpResponseBase(u)
  );
}

type LoadedHttpRequest = HttpRequestBase & {
  bodyStatus: "loaded";
  body: string;
};

function isLoadedHttpRequest(u: unknown): u is LoadedHttpRequest {
  return (
    isObject(u) && u.bodyStatus === "loaded" && typeof u.body === "string" && isHttpRequestBase(u)
  );
}

type LoadedHttpResponse = HttpResponseBase & {
  bodyStatus: "loaded";
  request: LoadedHttpRequest;
  body: string;
};

function isLoadedHttpResponse(u: unknown): u is LoadedHttpResponse {
  return (
    isObject(u) &&
    u.bodyStatus === "loaded" &&
    typeof u.body === "string" &&
    isLoadedHttpRequest(u.request) &&
    isHttpResponseBase(u)
  );
}

export function newHttpRequest(
  requestPausedEvent: Protocol.Fetch.RequestPausedEvent,
): PendingHttpRequest {
  let cachedHeaders: Protocol.Fetch.HeaderEntry[] | undefined;
  let cachedBody: string | undefined;

  return {
    createdAt: new Date().toISOString(),
    imported: false,
    bodyStatus: "pending",
    stage: "Request",
    requestId: requestPausedEvent.requestId,
    resourceType: requestPausedEvent.resourceType,
    get headers(): Protocol.Fetch.HeaderEntry[] {
      return (cachedHeaders ??= Object.entries(requestPausedEvent.request.headers).map(
        ([name, value]): Protocol.Fetch.HeaderEntry => ({ name, value }),
      ));
    },
    url: requestPausedEvent.request.url,
    method: requestPausedEvent.request.method,
    getBody: async () => {
      return (cachedBody ??= extractRequestBody(requestPausedEvent.request));
    },
    _requestPausedEvent: requestPausedEvent,
  };
}

export function newHttpResponse(
  requestPausedEvent: Protocol.Fetch.RequestPausedEvent,
  statusCode: number,
  getGetResponseBodyResponse: (
    requestId: Protocol.Fetch.RequestId,
  ) => Promise<Protocol.Network.GetResponseBodyResponse | Error>,
): PendingHttpResponse {
  let cachedBody: string | undefined;
  let cachedRequest: PendingHttpRequest | undefined;

  return {
    createdAt: new Date().toISOString(),
    imported: false,
    bodyStatus: "pending",
    stage: "Response",
    requestId: requestPausedEvent.requestId,
    resourceType: requestPausedEvent.resourceType,
    headers: requestPausedEvent.responseHeaders ?? [],
    url: requestPausedEvent.request.url,
    method: requestPausedEvent.request.method,
    statusCode,
    getBody: async () => {
      if (cachedBody !== undefined) {
        return cachedBody;
      } else {
        const body = await extractResponseBody(requestPausedEvent, getGetResponseBodyResponse);
        return body instanceof Error ? body : (cachedBody ??= body);
      }
    },
    get request(): PendingHttpRequest {
      return (cachedRequest ??= newHttpRequest(requestPausedEvent));
    },
    _requestPausedEvent: requestPausedEvent,
  };
}

export async function ensureLoadedHttpMessage(
  httpMessage: HttpMessage,
): Promise<LoadedHttpRequest | LoadedHttpResponse | Error> {
  return httpMessage.bodyStatus === "loaded"
    ? httpMessage
    : httpMessage.stage === "Request"
      ? loadHttpRequest(httpMessage)
      : loadHttpResponse(httpMessage);
}

async function loadHttpRequest(
  pendingHttpRequest: PendingHttpRequest,
): Promise<LoadedHttpRequest | Error> {
  const body = await pendingHttpRequest.getBody();
  if (body instanceof Error) {
    return body;
  }

  const { getBody, _requestPausedEvent, ...commonProps } = pendingHttpRequest;
  return {
    ...commonProps,
    bodyStatus: "loaded",
    body,
  };
}

async function loadHttpResponse(
  pendingHttpResponse: PendingHttpResponse,
): Promise<LoadedHttpResponse | Error> {
  const body = await pendingHttpResponse.getBody();
  if (body instanceof Error) {
    return body;
  }

  const loadedRequest = await loadHttpRequest(pendingHttpResponse.request);
  if (loadedRequest instanceof Error) {
    return loadedRequest;
  }

  const { getBody, _requestPausedEvent, ...commonProps } = pendingHttpResponse;
  return {
    ...commonProps,
    bodyStatus: "loaded",
    body,
    request: loadedRequest,
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

async function extractResponseBody(
  requestPausedEvent: Protocol.Fetch.RequestPausedEvent,
  getGetResponseBodyResponse: (
    requestId: Protocol.Fetch.RequestId,
  ) => Promise<Protocol.Network.GetResponseBodyResponse | Error>,
): Promise<string | Error> {
  // Do not attempt to get the response body for redirects as it causes an error
  if (
    requestPausedEvent.responseStatusCode !== undefined &&
    300 <= requestPausedEvent.responseStatusCode &&
    requestPausedEvent.responseStatusCode < 400
  ) {
    return "";
  }

  const getResponseBodyResponse = await getGetResponseBodyResponse(requestPausedEvent.requestId);
  if (getResponseBodyResponse instanceof Error) {
    return getResponseBodyResponse;
  }

  return getResponseBodyResponse.base64Encoded
    ? Base64.decode(getResponseBodyResponse.body)
    : getResponseBodyResponse.body;
}

export async function getRequestBody(httpRequest: HttpRequest): Promise<string | Error> {
  return httpRequest.bodyStatus === "loaded" ? httpRequest.body : httpRequest.getBody();
}

export async function getResponseBody(httpResponse: HttpResponse): Promise<string | Error> {
  return httpResponse.bodyStatus === "loaded" ? httpResponse.body : httpResponse.getBody();
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
  const body = await getRequestBody(httpRequest);
  if (body instanceof Error) {
    console.warn("Failed to get request body:", body);
    return;
  }

  const host = getHostname(httpRequest.url);
  if (host instanceof Error) {
    console.warn("Failed to get hostname:", host);
    return;
  }

  const debug = await createLabeledDebugLogger([
    "HTTP",
    httpRequest.requestId,
    host,
    httpRequest.method,
  ]);
  debug(httpRequest.url, { body, HttpRequest: httpRequest });
}

export const debugHttpResponse =
  import.meta.env.MODE === "development" ? debugHttpResponseImpl : () => Promise.resolve();

async function debugHttpResponseImpl(httpResponse: HttpResponse) {
  const body = await getResponseBody(httpResponse);
  if (body instanceof Error) {
    console.warn("Failed to get response body:", body);
    return;
  }

  const host = getHostname(httpResponse.url);
  if (host instanceof Error) {
    console.warn("Failed to get hostname:", host);
    return;
  }

  const location = getHeaderValue(httpResponse, "Location");

  const debug = await createLabeledDebugLogger([
    "HTTP",
    httpResponse.requestId,
    host,
    `${httpResponse.statusCode}`,
  ]);
  debug({ body, location, HttpResponse: httpResponse });
}

function getHostname(url: string): string | Error {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return new Error("Failed to extract hostname from url", { cause: err });
  }
}
