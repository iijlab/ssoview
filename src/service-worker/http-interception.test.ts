/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpRequest } from "@/common/models/http-message.ts";
import { findHttpRequestByFetchRequestId } from "@/common/services/http-store.ts";
import { getOngoingCaptureSessionId } from "@/service-worker/capture-manager.ts";
import { registerHttpInterceptionHandlers } from "./http-interception.ts";

vi.mock("@/common/services/http-store.ts", () => ({
  findHttpRequestByFetchRequestId: vi.fn(),
}));

vi.mock("@/service-worker/capture-manager.ts", () => ({
  getOngoingCaptureSessionId: vi.fn(),
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

const storedHttpRequest = {
  id: "stored-1",
  captureSessionId: "capture-session-1",
  stage: "Request",
  tabId: 1,
  fetchRequestId: "req-1",
  url: "https://sp.example.com/SAML2/resource",
  method: "GET",
} as HttpRequest;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(getOngoingCaptureSessionId).mockReset().mockResolvedValue("capture-session-1");
  vi.mocked(findHttpRequestByFetchRequestId).mockReset().mockResolvedValue(storedHttpRequest);
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
  it("gives the request the ongoing capture session and the tab", async () => {
    const onInterceptHttpRequest = vi.fn();
    registerHttpInterceptionHandlers(onInterceptHttpRequest, vi.fn());

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeRequestPausedEvent());

    await vi.waitFor(() => expect(onInterceptHttpRequest).toHaveBeenCalledOnce());
    expect(onInterceptHttpRequest).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ captureSessionId: "capture-session-1", tabId: 1 }),
    );
  });

  it("gives the response the ongoing capture session and the tab", async () => {
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onInterceptHttpResponse).toHaveBeenCalledOnce());
    expect(onInterceptHttpResponse).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ captureSessionId: "capture-session-1", tabId: 1 }),
      storedHttpRequest,
    );
  });

  it("skips the request but continues it when no capture session is ongoing", async () => {
    vi.mocked(getOngoingCaptureSessionId).mockResolvedValue(undefined);
    const onInterceptHttpRequest = vi.fn();
    registerHttpInterceptionHandlers(onInterceptHttpRequest, vi.fn());

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeRequestPausedEvent());

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueRequest", {
        requestId: "req-1",
        interceptResponse: true,
      }),
    );
    expect(onInterceptHttpRequest).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the response but continues it when no capture session is ongoing", async () => {
    vi.mocked(getOngoingCaptureSessionId).mockResolvedValue(undefined);
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onInterceptHttpResponse).not.toHaveBeenCalled();
    expect(findHttpRequestByFetchRequestId).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
  });

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
      expect.anything(),
    );
  });

  it("pairs the response with the stored request of the same request ID", async () => {
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(302));

    await vi.waitFor(() => expect(onInterceptHttpResponse).toHaveBeenCalledOnce());
    expect(findHttpRequestByFetchRequestId).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      "req-1",
    );
    const [, httpResponse, pairedHttpRequest] = onInterceptHttpResponse.mock.calls[0]!;
    expect(pairedHttpRequest).toBe(storedHttpRequest);
    expect(httpResponse.pairedHttpRequestId).toBe("stored-1");
  });

  it("skips the response but continues it when no paired request is stored", async () => {
    vi.mocked(findHttpRequestByFetchRequestId).mockResolvedValue(undefined);
    const onInterceptHttpResponse = vi.fn();
    registerHttpInterceptionHandlers(vi.fn(), onInterceptHttpResponse);

    fireDebuggerEvent({ tabId: 1 }, "Fetch.requestPaused", makeResponsePausedEvent(200));

    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith({ tabId: 1 }, "Fetch.continueResponse", {
        requestId: "req-1",
      }),
    );
    expect(onInterceptHttpResponse).not.toHaveBeenCalled();
    expect(sendCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      "Fetch.getResponseBody",
      expect.anything(),
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("skips the response but continues it when the paired request cannot be found", async () => {
    vi.mocked(findHttpRequestByFetchRequestId).mockResolvedValue(new Error("store error"));
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
