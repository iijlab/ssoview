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
import { isAttached } from "@/common/utils/chrome-debugger.ts";
import { tabExists } from "@/common/utils/chrome-tabs.ts";
import { isObject } from "@/common/utils/type-guard.ts";

// chrome.debugger.DetachReason is an enum, which is not compatible with the
// callback parameter type of chrome.debugger.onDetach.addListener. So we
// define our own type alias with the same values.
export type DebuggerDetachReason = "canceled_by_user" | "target_closed";

export function setupMonitoring(
  onInterceptHttpRequest: (tabId: number, httpRequest: HttpRequest) => Promise<void>,
  onInterceptHttpResponse: (tabId: number, httpResponse: HttpResponse) => Promise<void>,
  onMonitoringTerminated: (tabId: number, reason: DebuggerDetachReason) => Promise<void>,
): void {
  chrome.debugger.onEvent.addListener(
    onFetchRequestPausedEvent
      .bind(null, onInterceptHttpRequest)
      .bind(null, onInterceptHttpResponse),
  );

  // Event fired when debugger is detached by Chrome. Not fired when
  // chrome.debugger.detach() is called.
  chrome.debugger.onDetach.addListener((source, reason) => {
    console.info("Debugger detached:", { source, reason });

    if (source.tabId === undefined) {
      // Nothing we can do without the tab ID
      return;
    }

    (async (tabId: number) => {
      if (reason === "target_closed" && (await tabExists(tabId))) {
        // Possible Chrome bug: sometimes the tab is incorrectly detected as
        // closed when it's still open. In this case, restart monitoring.
        console.info("Target still exists. Attempting to restart.");
        const result = await startMonitoring(tabId);
        if (result instanceof Error) {
          console.warn("Failed to restart monitoring:", { error: result });
        } else {
          return;
        }
      }

      await onMonitoringTerminated(tabId, reason);
    })(source.tabId).catch((err) => {
      console.error("Unexpected error in debugger.onDetach event:", { error: err });
    });
  });
}

export async function startMonitoring(tabId: number): Promise<void | Error> {
  const attached = await isAttached(tabId);
  if (attached instanceof Error) {
    return attached;
  } else if (attached) {
    return new Error("Monitoring already started");
  }

  const attachResult = await attachTab(tabId);
  if (attachResult instanceof Error) {
    return attachResult;
  }

  const fetchResult = await enableFetch(tabId);
  if (fetchResult instanceof Error) {
    const detachResult = await detachTab(tabId);
    if (detachResult instanceof Error) {
      console.warn("Failed to detach from tab:", detachResult);
    }
    return fetchResult;
  }
}

export async function stopMonitoring(tabId: number): Promise<void | Error> {
  const result = await detachTab(tabId);
  if (result instanceof Error) {
    return new Error("Failed to detach from tab", { cause: result });
  }
}

async function attachTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    return new Error("Failed to attach to debugger", { cause: err });
  }
}

async function detachTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    return new Error("Failed to detach from debugger", { cause: err });
  }
}

async function enableFetch(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ resourceType: "Document" }],
    });
  } catch (err) {
    return new Error("Failed to enable fetch", { cause: err });
  }
}

function onFetchRequestPausedEvent(
  onInterceptHttpRequest: (tabId: number, httpRequest: HttpRequest) => Promise<void>,
  onInterceptHttpResponse: (tabId: number, httpResponse: HttpResponse) => Promise<void>,
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
    // NOTE: Returning here without calling Fetch.continueRequest/Response may
    // cause the request to stall. However, there's nothing we can do with
    // unexpected arguments, so we accept this behavior.
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
        await onInterceptHttpResponse(
          tabId,
          newHttpResponse(
            requestPausedEvent,
            requestPausedEvent.responseStatusCode,
            getGetResponseBodyResponse.bind(null, tabId),
          ),
        );
      }

      // NOTE: Response body cannot be retrieved after calling
      // Fetch.continueResponse
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
    return new Error("Failed to get response body", { cause: err });
  }
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
