/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { retrieveHttpMessages, storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";
import { processHttpRequest, processHttpResponse } from "./saml-tracer.ts";

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStepFromHttpRequest: vi.fn(),
  detectSamlStepFromHttpResponse: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  retrieveHttpMessages: vi.fn(),
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-recorder.ts", () => ({
  recordSamlTrace: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(retrieveHttpMessages).mockResolvedValue([]);
});

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    stage: "Request",
    captureSessionId: "capture-session-1",
    tabId: 1,
    fetchRequestId: "req-1",
    headers: [],
    url: "https://sp.example.com/",
    method: "GET",
    body: "",
    ...overrides,
  } as unknown as HttpRequest;
}

function makeResponse(overrides: Record<string, unknown> = {}): HttpResponse {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    stage: "Response",
    captureSessionId: "capture-session-1",
    tabId: 1,
    fetchRequestId: "req-1",
    headers: [{ name: "Date", value: "Thu, 01 Jan 2026 00:00:00 GMT" }],
    url: "https://sp.example.com/",
    method: "GET",
    statusCode: 200,
    body: "",
    ...overrides,
  } as unknown as HttpResponse;
}

//
// Tests
//

describe("processHttpRequest", () => {
  it("returns undefined when no SAML step is detected", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBeUndefined();
    expect(storeHttpMessage).not.toHaveBeenCalled();
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when detection fails", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(new Error("detection error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
  });

  it("stores the HTTP message and records the trace, and returns the correlation key", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledTimes(1);
    expect(storeHttpMessage).toHaveBeenCalledWith(request, 1, "session-1");
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      { step: 3, correlationKey: "session-1" },
      request,
    );
  });

  it("returns Error when storing the HTTP message fails", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML trace fails", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(new Error("record error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("record error");
  });
});

describe("processHttpResponse", () => {
  it("detects the step with the given paired request", async () => {
    const pairedRequest = makeRequest({ url: "https://sp.example.com/resource" });
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeUndefined();
    expect(detectSamlStepFromHttpResponse).toHaveBeenCalledWith(response, pairedRequest);
    expect(storeHttpMessage).not.toHaveBeenCalled();
  });

  it("stores the paired request before the response", async () => {
    const pairedRequest = makeRequest({ url: "https://sp.example.com/resource" });
    const response = makeResponse({ statusCode: 302 });
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledTimes(2);
    expect(storeHttpMessage).toHaveBeenNthCalledWith(1, pairedRequest, 1, "session-1");
    expect(storeHttpMessage).toHaveBeenNthCalledWith(2, response, 1, "session-1");
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      { step: 2, correlationKey: "session-1" },
      response,
      pairedRequest,
    );
  });

  it("returns Error when storing the paired request fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("uses the stored request instead of the recreated one when it exists", async () => {
    const storedRequest = makeRequest({ id: "stored-1", url: "https://sp.example.com/acs" });
    const pairedRequest = makeRequest({ id: "recreated-1", url: "https://sp.example.com/acs" });
    const response = makeResponse({ pairedHttpRequestId: "recreated-1" });
    vi.mocked(retrieveHttpMessages).mockResolvedValue([storedRequest]);
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 6,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBe("session-1");
    expect(retrieveHttpMessages).toHaveBeenCalledExactlyOnceWith(1, "session-1");
    expect(storeHttpMessage).toHaveBeenCalledExactlyOnceWith(
      { ...response, pairedHttpRequestId: "stored-1" },
      1,
      "session-1",
    );
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      { step: 6, correlationKey: "session-1" },
      { ...response, pairedHttpRequestId: "stored-1" },
      storedRequest,
    );
  });

  it("ignores stored messages of other fetch request IDs", async () => {
    const storedRequest = makeRequest({ id: "stored-1", fetchRequestId: "req-other" });
    const pairedRequest = makeRequest({ id: "recreated-1" });
    const response = makeResponse({ pairedHttpRequestId: "recreated-1" });
    vi.mocked(retrieveHttpMessages).mockResolvedValue([storedRequest]);
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    await processHttpResponse(1, response, pairedRequest);

    expect(storeHttpMessage).toHaveBeenNthCalledWith(1, pairedRequest, 1, "session-1");
    expect(storeHttpMessage).toHaveBeenNthCalledWith(2, response, 1, "session-1");
  });

  it("returns Error when retrieving stored messages fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(retrieveHttpMessages).mockResolvedValue(new Error("retrieve error"));
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("retrieve error");
    expect(storeHttpMessage).not.toHaveBeenCalled();
  });
});
