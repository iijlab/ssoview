/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpRequest, HttpResponse } from "@/common/models/http-message.ts";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { processHttpMessage } from "./saml-recorder.ts";

vi.mock("@/common/models/http-message.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/common/models/http-message.ts")>();
  return {
    ...original,
    debugHttpMessage: vi.fn(),
  };
});

vi.mock("@/common/models/saml-trace.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/common/models/saml-trace.ts")>();
  return {
    ...original,
    debugSamlTrace: vi.fn(),
  };
});

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStep: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  storeSamlTrace: vi.fn(),
}));

const { detectSamlStep } = await import("@/common/services/saml-detector.ts");
const { storeHttpMessage } = await import("@/common/services/http-store.ts");
const { storeSamlTrace } = await import("@/common/services/saml-store.ts");

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
    bodyStatus: "loaded",
    stage: "Request",
    requestId: "req-1",
    resourceType: "Document",
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
    bodyStatus: "loaded",
    stage: "Response",
    requestId: "req-1",
    resourceType: "Document",
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

describe("processHttpMessage", () => {
  it("returns undefined when no SAML trace is detected", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStep).mockResolvedValue(undefined);

    const result = await processHttpMessage(1, request);

    expect(result).toBeUndefined();
    expect(storeHttpMessage).not.toHaveBeenCalled();
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when detectSamlStep fails", async () => {
    const request = makeRequest();
    vi.mocked(detectSamlStep).mockResolvedValue(new Error("detection error"));

    const result = await processHttpMessage(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("detection error");
  });

  it("stores HTTP message and SAML trace and returns sessionId on detection", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpMessage(1, request);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledWith(request, 1, "session-1");
    expect(storeSamlTrace).toHaveBeenCalledWith(detected, 1);
  });

  it("stores the paired request when step is 2 and stage is Response", async () => {
    const pairedRequest = makeRequest({ url: "https://sp.example.com/resource" });
    const response = makeResponse({ statusCode: 302 }, pairedRequest);
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 2,
      type: "IncomingAuthnRequest",
    });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await processHttpMessage(1, response);

    expect(result).toBe("session-1");
    expect(storeHttpMessage).toHaveBeenCalledTimes(2);
    expect(storeHttpMessage).toHaveBeenNthCalledWith(1, pairedRequest, 1, "session-1");
    expect(storeHttpMessage).toHaveBeenNthCalledWith(2, response, 1, "session-1");
  });

  it("does not store the paired request when step is 2 but stage is Request", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 2,
      type: "IncomingAuthnRequest",
    });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    await processHttpMessage(1, request);

    expect(storeHttpMessage).toHaveBeenCalledTimes(1);
    expect(storeHttpMessage).toHaveBeenCalledWith(request, 1, "session-1");
  });

  it("does not store the paired request when stage is Response but step is not 2", async () => {
    const response = makeResponse();
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 6,
      type: "AuthenticatedResourceResponse",
    });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    await processHttpMessage(1, response);

    expect(storeHttpMessage).toHaveBeenCalledTimes(1);
    expect(storeHttpMessage).toHaveBeenCalledWith(response, 1, "session-1");
  });

  it("returns Error when storing the paired request fails", async () => {
    const response = makeResponse();
    const detected = makeSamlTrace({
      sessionId: "session-1",
      step: 2,
      type: "IncomingAuthnRequest",
    });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpMessage(1, response);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when storing the HTTP message fails", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(new Error("store error"));

    const result = await processHttpMessage(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("store error");
    expect(storeSamlTrace).not.toHaveBeenCalled();
  });

  it("returns Error when storing the SAML trace fails", async () => {
    const request = makeRequest();
    const detected = makeSamlTrace({ sessionId: "session-1", step: 3 });
    vi.mocked(detectSamlStep).mockResolvedValue(detected);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(new Error("saml store error"));

    const result = await processHttpMessage(1, request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("saml store error");
  });
});
