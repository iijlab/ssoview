/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, HttpResponse } from "@/common/models/http-message.ts";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";
import { processHttpRequest, processHttpResponse } from "./saml-recorder.ts";

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStepFromHttpRequest: vi.fn(),
  detectSamlStepFromHttpResponse: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  storeSamlTrace: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    stage: "Request",
    fetchRequestId: "req-1",
    headers: [],
    url: "https://sp.example.com/",
    method: "GET",
    body: "",
    ...overrides,
  } as unknown as HttpRequest;
}

function makeResponse(
  overrides: Record<string, unknown> = {},
  request?: HttpRequest,
): HttpResponse {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    stage: "Response",
    fetchRequestId: "req-1",
    headers: [{ name: "Date", value: "Thu, 01 Jan 2026 00:00:00 GMT" }],
    url: "https://sp.example.com/",
    method: "GET",
    statusCode: 200,
    body: "",
    request: request ?? makeRequest(),
    ...overrides,
  } as unknown as HttpResponse;
}

function makeSamlTrace(overrides: Partial<SamlTrace> = {}): SamlTrace {
  return {
    sessionId: "session-1",
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    action: "test action",
    step: 3,
    type: "OutgoingAuthnRequest",
    ...overrides,
  } as SamlTrace;
}

//
// Tests
//

describe("processHttpRequest", () => {
  it("returns undefined when no SAML trace is detected", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBeUndefined();
    expect(storeHttpMessage).not.toHaveBeenCalled();
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when detection fails", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(new Error("detection error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
  });

  it("stores HTTP message and SAML trace and returns sessionId on detection", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpRequest(1, request);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledTimes(1);
    expect(storeHttpMessage).toHaveBeenCalledWith(request, 1, "session-1");
    expect(storeSamlTrace).toHaveBeenCalledWith(detected, 1);
  });

  it("returns Error when storing the HTTP message fails", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when storing the SAML trace fails", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(new Error("saml store error"));

    const result = await processHttpRequest(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("saml store error");
  });
});

describe("processHttpResponse", () => {
  it("detects the step with the given paired request", async () => {
    const pairedRequest = makeRequest({ url: "https://sp.example.com/resource" });
    const response = makeResponse({}, pairedRequest);
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeUndefined();
    expect(detectSamlStepFromHttpResponse).toHaveBeenCalledWith(response, pairedRequest);
    expect(storeHttpMessage).not.toHaveBeenCalled();
  });

  it("stores the paired request before the response", async () => {
    const pairedRequest = makeRequest({ url: "https://sp.example.com/resource" });
    const response = makeResponse({ statusCode: 302 }, pairedRequest);
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 2,
      type: "IncomingAuthnRequest",
    });
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledTimes(2);
    expect(storeHttpMessage).toHaveBeenNthCalledWith(1, pairedRequest, 1, "session-1");
    expect(storeHttpMessage).toHaveBeenNthCalledWith(2, response, 1, "session-1");
  });

  it("returns Error when storing the paired request fails", async () => {
    const pairedRequest = makeRequest();
    const response = makeResponse({}, pairedRequest);
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 2,
      type: "IncomingAuthnRequest",
    });
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpResponse(1, response, pairedRequest);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });
});
