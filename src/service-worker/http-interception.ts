/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import {
  type HttpRequest,
  type HttpResponse,
  newHttpRequest,
  newHttpResponse,
} from "@/common/models/http-message.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export function registerHttpInterceptionHandlers(
  onInterceptHttpRequest: (tabId: number, httpRequest: HttpRequest) => Promise<void>,
  onInterceptHttpResponse: (
    tabId: number,
    httpResponse: HttpResponse,
    pairedHttpRequest: HttpRequest,
  ) => Promise<void>,
): void {
  chrome.debugger.onEvent.addListener(
    onFetchRequestPausedEvent
      .bind(null, onInterceptHttpRequest)
      .bind(null, onInterceptHttpResponse),
  );
}

function onFetchRequestPausedEvent(
  onInterceptHttpRequest: (tabId: number, httpRequest: HttpRequest) => Promise<void>,
  onInterceptHttpResponse: (
    tabId: number,
    httpResponse: HttpResponse,
    pairedHttpRequest: HttpRequest,
  ) => Promise<void>,
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
): void {
  if (method !== "Fetch.requestPaused") {
    console.warn("Unexpected debugger event:", { source, method, params });
    return;
  }

  if (source.tabId === undefined || !isRequestPausedEvent(params)) {
    console.warn("Unexpected Fetch.requestPaused parameters:", { source, method, params });
    // NOTE: Returning here without calling Fetch.continueRequest/Response may cause the request
    // to stall. However, there's nothing we can do with unexpected arguments, so we accept this
    // behavior.
    return;
  }

  (async (tabId: number, requestPausedEvent: Protocol.Fetch.RequestPausedEvent) => {
    // Determine request or response stage based on the presence of status code
    if (!requestPausedEvent.responseStatusCode) {
      // Ignore non-http URLs like chrome://
      if (requestPausedEvent.request.url.startsWith("http")) {
        await onInterceptHttpRequest(tabId, newHttpRequest(requestPausedEvent));
      }

      try {
        await chrome.debugger.sendCommand(source, "Fetch.continueRequest", {
          requestId: requestPausedEvent.requestId,
          interceptResponse: true,
        });
      } catch (err) {
        console.error("Failed to send Fetch.continueRequest command:", err);
      }
    } else {
      // Ignore non-http URLs like chrome://
      if (requestPausedEvent.request.url.startsWith("http")) {
        // Do not attempt to get the response body for redirects as it causes an error
        const getResponseBodyResponse = isRedirectResponse(requestPausedEvent)
          ? undefined
          : await getGetResponseBodyResponse(tabId, requestPausedEvent.requestId);
        if (getResponseBodyResponse instanceof Error) {
          console.warn("Failed to get response body:", { error: getResponseBodyResponse });
        } else {
          const pairedHttpRequest = newHttpRequest(requestPausedEvent);
          const httpResponse = newHttpResponse(
            requestPausedEvent,
            requestPausedEvent.responseStatusCode,
            getResponseBodyResponse,
            pairedHttpRequest,
          );
          await onInterceptHttpResponse(tabId, httpResponse, pairedHttpRequest);
        }
      }

      // NOTE: Response body cannot be retrieved after calling Fetch.continueResponse
      try {
        await chrome.debugger.sendCommand(source, "Fetch.continueResponse", {
          requestId: requestPausedEvent.requestId,
        });
      } catch (err) {
        console.error("Failed to send Fetch.continueResponse command:", err);
      }
    }
  })(source.tabId, params).catch((err) => {
    console.error("Unexpected error in Fetch.requestPaused event:", { error: err });
  });
}

async function getGetResponseBodyResponse(
  tabId: number,
  requestId: Protocol.Fetch.RequestId,
): Promise<Protocol.Network.GetResponseBodyResponse | Error> {
  try {
    const getResponseBodyResponse = await chrome.debugger.sendCommand(
      { tabId },
      "Fetch.getResponseBody",
      { requestId },
    );
    return isGetResponseBodyResponse(getResponseBodyResponse)
      ? getResponseBodyResponse
      : new Error("Invalid response body");
  } catch (err) {
    return new Error("Failed to send Fetch.getResponseBody command", { cause: err });
  }
}

function isRedirectResponse(requestPausedEvent: Protocol.Fetch.RequestPausedEvent): boolean {
  return (
    requestPausedEvent.responseStatusCode !== undefined &&
    300 <= requestPausedEvent.responseStatusCode &&
    requestPausedEvent.responseStatusCode < 400
  );
}

//
// Type guards
//

function isRequestPausedEvent(u: unknown): u is Protocol.Fetch.RequestPausedEvent {
  // Only validate the properties we use
  return (
    isObject(u) &&
    isRequestId(u.requestId) &&
    isRequest(u.request) &&
    (!("responseStatusCode" in u) || isInteger(u.responseStatusCode))
  );
}

function isGetResponseBodyResponse(u: unknown): u is Protocol.Network.GetResponseBodyResponse {
  return isObject(u) && typeof u.body === "string" && typeof u.base64Encoded === "boolean";
}

function isRequestId(u: unknown): u is Protocol.Fetch.RequestId {
  return typeof u === "string";
}

function isInteger(u: unknown): u is Protocol.integer {
  return typeof u === "number";
}

function isRequest(u: unknown): u is Protocol.Network.Request {
  // Only validate the properties we use
  return (
    isObject(u) &&
    typeof u.url === "string" &&
    typeof u.method === "string" &&
    (!("hasPostData" in u) || typeof u.hasPostData === "boolean") &&
    (!("postDataEntries" in u) || isPostDataEntryArray(u.postDataEntries))
  );
}

function isPostDataEntryArray(u: unknown): u is Protocol.Network.PostDataEntry[] {
  return Array.isArray(u) && u.every(isPostDataEntry);
}

function isPostDataEntry(u: unknown): u is Protocol.Network.PostDataEntry {
  return isObject(u) && (!("bytes" in u) || typeof u.bytes === "string");
}
