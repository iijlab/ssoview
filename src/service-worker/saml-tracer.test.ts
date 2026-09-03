/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { deleteHttpMessages, saveHttpMessage } from "@/common/services/http-store.ts";
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
  deleteHttpMessages: vi.fn(),
  saveHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-recorder.ts", () => ({
  recordSamlTrace: vi.fn(),
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
    observedAt: "2026-01-01T00:00:00Z",
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
  it("saves the request and returns undefined when no SAML step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBeUndefined();
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("saves the request and returns Error when detection fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(new Error("detection error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("records the trace and returns the correlation key when a step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBe("session-1");
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      { step: 3, correlationKey: "session-1" },
      request,
    );
  });

  it("returns Error without detecting when saving the request fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(detectSamlStepFromHttpRequest).not.toHaveBeenCalled();
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML trace fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(recordSamlTrace).mockResolvedValue(new Error("record error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("record error");
  });
});

describe("processHttpResponse", () => {
  it("saves the response and records the trace with the paired request", async () => {
    const pairedRequest = makeRequest({ id: "stored-1" });
    const response = makeResponse({ id: "msg-2", pairedHttpRequestId: "stored-1" });
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBe("session-1");
    expect(detectSamlStepFromHttpResponse).toHaveBeenCalledWith(response, pairedRequest);
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(response);
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      "capture-session-1",
      1,
      { step: 2, correlationKey: "session-1" },
      response,
      pairedRequest,
    );
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("deletes the paired request when neither the response nor the request is a step", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(deleteHttpMessages).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeUndefined();
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(recordSamlTrace).not.toHaveBeenCalled();
    expect(detectSamlStepFromHttpRequest).toHaveBeenCalledExactlyOnceWith(pairedRequest);
    expect(deleteHttpMessages).toHaveBeenCalledExactlyOnceWith([pairedRequest]);
  });

  it("keeps the paired request when the request itself is a step", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeUndefined();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when deleting the unreferenced request fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(deleteHttpMessages).mockResolvedValue(new Error("delete error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("delete error");
  });

  it("returns Error when detection fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(new Error("detection error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when saving the response fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(recordSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML trace fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 6,
      correlationKey: "session-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(new Error("record error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("record error");
  });
});
