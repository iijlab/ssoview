/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpRequest } from "@/core/http/http-message.ts";
import { findHttpRequestByFetchRequestId } from "@/core/http/http-message-repository.ts";
import { getOngoingTracingSessionId } from "@/core/tracing/tracing-state-query.ts";
import { registerHttpInterceptionHandlers } from "./http-message-interceptor.ts";

vi.mock("@/core/http/http-message-repository.ts", () => ({
  findHttpRequestByFetchRequestId: vi.fn(),
}));

vi.mock("@/core/tracing/tracing-state-query.ts", () => ({
  getOngoingTracingSessionId: vi.fn(),
}));

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

const savedHttpRequest = {
  id: "msg-1",
  tracingSessionId: "tracing-session-1",
  type: "Request",
  tabId: 1,
  fetchRequestId: "req-1",
  url: "https://sp.example.com/SAML2/resource",
  method: "GET",
} as HttpRequest;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getOngoingTracingSessionId).mockReset().mockResolvedValue("tracing-session-1");
  vi.mocked(findHttpRequestByFetchRequestId).mockReset().mockResolvedValue(savedHttpRequest);
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

function makeRequestPausedEvent(): Protocol.Fetch.RequestPausedEvent {
  return {
    requestId: "req-1",
    request: {
      url: "https://sp.example.com/SAML2/resource",
      method: "GET",
      headers: { Host: "sp.example.com" },
    },
  } as unknown as Protocol.Fetch.RequestPausedEvent;
}

function makeResponsePausedEvent(responseStatusCode: number): Protocol.Fetch.RequestPausedEvent {
  return {
    ...makeRequestPausedEvent(),
    responseStatusCode,
    responseHeaders: [],
  } as unknown as Protocol.Fetch.RequestPausedEvent;
}

//
// Tests
//

describe("registerHttpInterceptionHandlers", () => {
  it("gives the request the ongoing tracing session and the tab", async () => {
    const onHttpRequestIntercepted = vi.fn();
    registerHttpInterceptionHandlers(onHttpRequestIntercepted, vi.fn());

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeRequestPausedEvent());

    await vi.waitFor(() => expect(onHttpRequestIntercepted).toHaveBeenCalledOnce());
    expect(onHttpRequestIntercepted).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ tracingSessionId: "tracing-session-1", tabId: 1 }),
    );
  });

  it("gives the response the ongoing tracing session and the tab", async () => {
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onHttpResponseIntercepted).toHaveBeenCalledOnce());
    expect(onHttpResponseIntercepted).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ tracingSessionId: "tracing-session-1", tabId: 1 }),
      savedHttpRequest,
    );
  });

  it("skips the request but continues it when no tracing session is ongoing", async () => {
    vi.mocked(getOngoingTracingSessionId).mockResolvedValue(undefined);
    const onHttpRequestIntercepted = vi.fn();
    registerHttpInterceptionHandlers(onHttpRequestIntercepted, vi.fn());

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeRequestPausedEvent());

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueRequest", {
        requestId: "req-1",
        interceptResponse: true,
      }),
    );
    expect(onHttpRequestIntercepted).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the response but continues it when no tracing session is ongoing", async () => {
    vi.mocked(getOngoingTracingSessionId).mockResolvedValue(undefined);
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onHttpResponseIntercepted).not.toHaveBeenCalled();
    expect(findHttpRequestByFetchRequestId).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
  });

  it("does not send Fetch.getResponseBody for redirects", async () => {
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onHttpResponseIntercepted).toHaveBeenCalledOnce());
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
    expect(onHttpResponseIntercepted).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ body: undefined }),
      expect.anything(),
    );
  });

  it("pairs the response with the saved request of the same request ID", async () => {
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onHttpResponseIntercepted).toHaveBeenCalledOnce());
    expect(findHttpRequestByFetchRequestId).toHaveBeenCalledExactlyOnceWith(
      "tracing-session-1",
      1,
      "req-1",
    );
    const [, httpResponse, pairedHttpRequest] = onHttpResponseIntercepted.mock.calls[0]!;
    expect(pairedHttpRequest).toBe(savedHttpRequest);
    expect(httpResponse.pairedHttpRequestId).toBe("msg-1");
  });

  it("skips the response but continues it when no paired request is saved", async () => {
    vi.mocked(findHttpRequestByFetchRequestId).mockResolvedValue(undefined);
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onHttpResponseIntercepted).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the response but continues it when the paired request cannot be found", async () => {
    vi.mocked(findHttpRequestByFetchRequestId).mockResolvedValue(new Error("error"));
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onHttpResponseIntercepted).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the response but continues it when the body cannot be retrieved", async () => {
    sendCommand.mockImplementation(async (_source: unknown, method: string) => {
      if (method === "Fetch.getResponseBody") {
        throw new Error("Debugger is not attached to the tab");
      }
    });
    const onHttpResponseIntercepted = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onHttpResponseIntercepted);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onHttpResponseIntercepted).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });
});
