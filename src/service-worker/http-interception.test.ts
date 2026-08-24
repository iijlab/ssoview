/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerHttpInterceptionHandlers } from "./http-interception.ts";

//
// Helpers
//

type DebuggerEventListener = (
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
) => void;

const eventListeners: DebuggerEventListener[] = [];
const sendCommand = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  eventListeners.length = 0;
  sendCommand.mockReset();
  vi.stubGlobal("chrome", {
    debugger: {
      onEvent: { addListener: (listener: DebuggerEventListener) => eventListeners.push(listener) },
      sendCommand,
    },
  });
});

function fireDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
): void {
  const listener = eventListeners[0];
  if (listener === undefined) {
    throw new Error("No debugger event listener is registered");
  }

  listener(source, method, params);
}

function makeResponsePausedEvent(responseStatusCode: number): Protocol.Fetch.RequestPausedEvent {
  return {
    requestId: "req-1",
    request: {
      url: "https://sp.example.com/SAML2/resource",
      method: "GET",
      headers: { Host: "sp.example.com" },
    },
    responseStatusCode,
    responseHeaders: [],
  } as unknown as Protocol.Fetch.RequestPausedEvent;
}

//
// Tests
//

describe("registerHttpInterceptionHandlers", () => {
  it("does not send Fetch.getResponseBody for redirects", async () => {
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onInterceptHttpResponse).toHaveBeenCalledOnce());
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
    expect(onInterceptHttpResponse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ body: undefined }),
    );
  });

  it("pairs the response with a request built from the same event", async () => {
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onInterceptHttpResponse).toHaveBeenCalledOnce());
    expect(onInterceptHttpResponse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        request: expect.objectContaining({
          stage: "Request",
          requestId: "req-1",
          url: "https://sp.example.com/SAML2/resource",
          method: "GET",
        }),
      }),
    );
  });

  it("skips the response but continues it when the body cannot be retrieved", async () => {
    sendCommand.mockImplementation(async (_source: unknown, method: string) => {
      if (method === "Fetch.getResponseBody") {
        throw new Error("Debugger is not attached to the tab");
      }
    });
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onInterceptHttpResponse).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });
});
