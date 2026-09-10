/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { deleteHttpMessages, saveHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlLog } from "@/common/services/saml-recorder.ts";
import { processHttpRequest, processHttpResponse } from "./saml-tracer.ts";

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlSignalFromHttpRequest: vi.fn(),
  detectSamlSignalFromHttpResponse: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  deleteHttpMessages: vi.fn(),
  saveHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-recorder.ts", () => ({
  recordSamlLog: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
  return {
    observedAt: "2026-01-01T00:00:00Z",
    type: "Request",
    tracingSessionId: "tracing-session-1",
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
    observedAt: "2026-01-01T00:00:00Z",
    type: "Response",
    tracingSessionId: "tracing-session-1",
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
  it("saves the request and returns undefined when no SAML step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);

    const result = await processHttpRequest(request);

    expect(result).toBeUndefined();
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("saves the request and returns Error when detection fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(new Error("detection error"));

    const result = await processHttpRequest(request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("records the log and returns the SSO trace ID when a step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(recordSamlLog).mockResolvedValue({ id: "trace-1" } as SsoTrace);

    const result = await processHttpRequest(request);

    expect(result).toBe("trace-1");
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).toHaveBeenCalledExactlyOnceWith(
      "tracing-session-1",
      { step: 3, correlationKey: "session-1" },
      request,
    );
  });

  it("returns Error without detecting when saving the request fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpRequest(request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(detectSamlSignalFromHttpRequest).not.toHaveBeenCalled();
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML log fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(recordSamlLog).mockResolvedValue(new Error("record error"));

    const result = await processHttpRequest(request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("record error");
  });
});

describe("processHttpResponse", () => {
  it("saves the response and records the log with the paired request", async () => {
    const pairedRequest = makeRequest({ id: "stored-1" });
    const response = makeResponse({ id: "msg-2", pairedHttpRequestId: "stored-1" });
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue({ id: "trace-1" } as SsoTrace);

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBe("trace-1");
    expect(detectSamlSignalFromHttpResponse).toHaveBeenCalledWith(response, pairedRequest);
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(response);
    expect(recordSamlLog).toHaveBeenCalledExactlyOnceWith(
      "tracing-session-1",
      { step: 2, correlationKey: "session-1" },
      response,
      pairedRequest,
    );
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("deletes the paired request when neither the response nor the request is a step", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(deleteHttpMessages).mockResolvedValue(undefined);

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeUndefined();
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(recordSamlLog).not.toHaveBeenCalled();
    expect(detectSamlSignalFromHttpRequest).toHaveBeenCalledExactlyOnceWith(pairedRequest);
    expect(deleteHttpMessages).toHaveBeenCalledExactlyOnceWith([pairedRequest]);
  });

  it("keeps the paired request when the request itself is a step", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeUndefined();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when deleting the unreferenced request fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(deleteHttpMessages).mockResolvedValue(new Error("delete error"));

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("delete error");
  });

  it("returns Error when detection fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(new Error("detection error"));

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when saving the response fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML log fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 6,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(new Error("record error"));

    const result = await processHttpResponse(response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("record error");
  });
});
