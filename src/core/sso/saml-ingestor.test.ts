/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/core/http/http-message.ts";
import { deleteHttpMessages, saveHttpMessage } from "@/core/http/http-message-repository.ts";
import { recordSamlLog } from "@/core/sso/saml-log-recorder.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/core/sso/saml-signal-detector.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { ingestHttpRequestForSaml, ingestHttpResponseForSaml } from "./saml-ingestor.ts";

vi.mock("@/core/sso/saml-signal-detector.ts", () => ({
  detectSamlSignalFromHttpRequest: vi.fn(),
  detectSamlSignalFromHttpResponse: vi.fn(),
}));

vi.mock("@/core/http/http-message-repository.ts", () => ({
  deleteHttpMessages: vi.fn(),
  saveHttpMessage: vi.fn(),
}));

vi.mock("@/core/sso/saml-log-recorder.ts", () => ({
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

describe("ingestHttpRequestForSaml", () => {
  it("saves the request and returns undefined when no SAML step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);

    const result = await ingestHttpRequestForSaml(request);

    expect(result).toBeUndefined();
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("saves the request and returns Error when detection fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    const error = new Error("error");
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(error);

    const result = await ingestHttpRequestForSaml(request);

    expect(result).toBe(error);
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("records the log and returns the SSO trace ID when a step is detected", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "correlation-key-1",
    });
    vi.mocked(recordSamlLog).mockResolvedValue({ id: "sso-trace-1" } as SsoTrace);

    const result = await ingestHttpRequestForSaml(request);

    expect(result).toBe("sso-trace-1");
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(request);
    expect(recordSamlLog).toHaveBeenCalledExactlyOnceWith(
      "tracing-session-1",
      { step: 3, correlationKey: "correlation-key-1" },
      request,
    );
  });

  it("returns Error without detecting when saving the request fails", async () => {
    const request = makeRequest();
    const error = new Error("error");
    vi.mocked(saveHttpMessage).mockResolvedValue(error);

    const result = await ingestHttpRequestForSaml(request);

    expect(result).toBe(error);
    expect(detectSamlSignalFromHttpRequest).not.toHaveBeenCalled();
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML log fails", async () => {
    const request = makeRequest();
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "correlation-key-1",
    });
    const error = new Error("error");
    vi.mocked(recordSamlLog).mockResolvedValue(error);

    const result = await ingestHttpRequestForSaml(request);

    expect(result).toBe(error);
  });
});

describe("ingestHttpResponseForSaml", () => {
  it("saves the response and records the log with the paired request", async () => {
    const pairedRequest = makeRequest({ id: "msg-1" });
    const response = makeResponse({ id: "msg-2", pairedHttpRequestId: "msg-1" });
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue({ id: "sso-trace-1" } as SsoTrace);

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBe("sso-trace-1");
    expect(detectSamlSignalFromHttpResponse).toHaveBeenCalledWith(response, pairedRequest);
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith(response);
    expect(recordSamlLog).toHaveBeenCalledExactlyOnceWith(
      "tracing-session-1",
      { step: 2, correlationKey: "correlation-key-1" },
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

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

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
      correlationKey: "correlation-key-1",
    });

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBeUndefined();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when deleting the unreferenced request fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);
    const error = new Error("error");
    vi.mocked(deleteHttpMessages).mockResolvedValue(error);

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBe(error);
  });

  it("returns Error when detection fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    const error = new Error("error");
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue(error);

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBe(error);
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns Error when saving the response fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 2,
      correlationKey: "correlation-key-1",
    });
    const error = new Error("error");
    vi.mocked(saveHttpMessage).mockResolvedValue(error);

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBe(error);
    expect(recordSamlLog).not.toHaveBeenCalled();
  });

  it("returns Error when recording the SAML log fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse();
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      step: 6,
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    const error = new Error("error");
    vi.mocked(recordSamlLog).mockResolvedValue(error);

    const result = await ingestHttpResponseForSaml(response, pairedRequest);

    expect(result).toBe(error);
  });
});
