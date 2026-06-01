/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it, vi } from "vitest";
import type { HttpMessage, HttpRequest, HttpResponse } from "./http-message.ts";
import {
  ensureLoadedHttpMessage,
  getHeaderValue,
  getRequestBody,
  getResponseBody,
  isHttpMessage,
} from "./http-message.ts";

//
// Helpers
//

function makeLoadedRequest(overrides: Record<string, unknown> = {}): HttpRequest {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    bodyStatus: "loaded",
    stage: "Request",
    requestId: "req-1",
    resourceType: "Document",
    headers: [],
    url: "https://example.com/",
    method: "GET",
    body: "",
    ...overrides,
  } as unknown as HttpRequest;
}

function makePendingRequest(
  getBody: () => Promise<string | Error>,
  overrides: Record<string, unknown> = {},
): HttpRequest {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    bodyStatus: "pending",
    stage: "Request",
    requestId: "req-1",
    resourceType: "Document",
    headers: [],
    url: "https://example.com/",
    method: "GET",
    getBody,
    _requestPausedEvent: {},
    ...overrides,
  } as unknown as HttpRequest;
}

function makeLoadedResponse(overrides: Record<string, unknown> = {}): HttpResponse {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    bodyStatus: "loaded",
    stage: "Response",
    requestId: "req-1",
    resourceType: "Document",
    headers: [],
    url: "https://example.com/",
    method: "GET",
    statusCode: 200,
    body: "<html></html>",
    request: makeLoadedRequest(),
    ...overrides,
  } as unknown as HttpResponse;
}

function makePendingResponse(
  getBody: () => Promise<string | Error>,
  request?: HttpRequest,
  overrides: Record<string, unknown> = {},
): HttpResponse {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    bodyStatus: "pending",
    stage: "Response",
    requestId: "req-1",
    resourceType: "Document",
    headers: [],
    url: "https://example.com/",
    method: "GET",
    statusCode: 200,
    getBody,
    request: request ?? makePendingRequest(async () => "request body"),
    _requestPausedEvent: {},
    ...overrides,
  } as unknown as HttpResponse;
}

//
// Tests
//

describe("isHttpMessage", () => {
  const validLoadedHttpRequest = {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    requestId: "req-123",
    resourceType: "Document",
    headers: [{ name: "Content-Type", value: "text/html" }],
    url: "https://example.com/",
    method: "GET",
    stage: "Request",
    bodyStatus: "loaded",
    body: "",
  };

  const validLoadedHttpResponse = {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    requestId: "req-123",
    resourceType: "Document",
    headers: [{ name: "Content-Type", value: "text/html" }],
    url: "https://example.com/",
    method: "GET",
    stage: "Response",
    statusCode: 200,
    bodyStatus: "loaded",
    body: "<html></html>",
    request: validLoadedHttpRequest,
  };

  it("returns true for valid LoadedHttpRequest", () => {
    expect(isHttpMessage(validLoadedHttpRequest)).toBe(true);
  });

  it("returns true for valid LoadedHttpResponse", () => {
    expect(isHttpMessage(validLoadedHttpResponse)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isHttpMessage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isHttpMessage(undefined)).toBe(false);
  });

  it("returns false when createdAt is missing", () => {
    const { createdAt, ...msg } = validLoadedHttpRequest;
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when stage is invalid", () => {
    const msg = { ...validLoadedHttpRequest, stage: "Invalid" };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when headers is not an array", () => {
    const msg = { ...validLoadedHttpRequest, headers: "invalid" };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when headers contains invalid entry", () => {
    const msg = { ...validLoadedHttpRequest, headers: [{ name: "Content-Type" }] };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false for Response without statusCode", () => {
    const { statusCode, ...msg } = validLoadedHttpResponse;
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false for Response with invalid request", () => {
    const msg = { ...validLoadedHttpResponse, request: { invalid: true } };
    expect(isHttpMessage(msg)).toBe(false);
  });
});

describe("getHeaderValue", () => {
  const httpMessage = makeLoadedRequest({
    headers: [
      { name: "Content-Type", value: "text/html" },
      { name: "X-Custom-Header", value: "custom-value" },
      { name: "Cache-Control", value: "no-cache" },
    ],
  }) as HttpMessage;

  it("returns header value for exact case match", () => {
    expect(getHeaderValue(httpMessage, "Content-Type")).toBe("text/html");
  });

  it("returns header value for case-insensitive match", () => {
    expect(getHeaderValue(httpMessage, "content-type")).toBe("text/html");
    expect(getHeaderValue(httpMessage, "CONTENT-TYPE")).toBe("text/html");
  });

  it("returns undefined for non-existent header", () => {
    expect(getHeaderValue(httpMessage, "X-Not-Found")).toBeUndefined();
  });

  it("returns value for custom header", () => {
    expect(getHeaderValue(httpMessage, "x-custom-header")).toBe("custom-value");
  });
});

describe("getRequestBody", () => {
  it("returns body directly for loaded request", async () => {
    const request = makeLoadedRequest({ body: "loaded body" });

    const result = await getRequestBody(request);

    expect(result).toBe("loaded body");
  });

  it("calls getBody for pending request", async () => {
    const getBody = vi.fn().mockResolvedValue("fetched body");
    const request = makePendingRequest(getBody);

    const result = await getRequestBody(request);

    expect(result).toBe("fetched body");
    expect(getBody).toHaveBeenCalledOnce();
  });

  it("returns Error when getBody fails for pending request", async () => {
    const request = makePendingRequest(async () => new Error("fetch failed"));

    const result = await getRequestBody(request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("fetch failed");
  });
});

describe("getResponseBody", () => {
  it("returns body directly for loaded response", async () => {
    const response = makeLoadedResponse({ body: "loaded response" });

    const result = await getResponseBody(response);

    expect(result).toBe("loaded response");
  });

  it("calls getBody for pending response", async () => {
    const getBody = vi.fn().mockResolvedValue("fetched response");
    const response = makePendingResponse(getBody);

    const result = await getResponseBody(response);

    expect(result).toBe("fetched response");
    expect(getBody).toHaveBeenCalledOnce();
  });

  it("returns Error when getBody fails for pending response", async () => {
    const response = makePendingResponse(async () => new Error("response fetch failed"));

    const result = await getResponseBody(response);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("response fetch failed");
  });
});

describe("ensureLoadedHttpMessage", () => {
  it("returns loaded request as-is", async () => {
    const request = makeLoadedRequest({ body: "already loaded" });

    const result = await ensureLoadedHttpMessage(request);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      bodyStatus: "loaded",
      body: "already loaded",
      stage: "Request",
    });
  });

  it("returns loaded response as-is", async () => {
    const response = makeLoadedResponse({ body: "already loaded" });

    const result = await ensureLoadedHttpMessage(response);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      bodyStatus: "loaded",
      body: "already loaded",
      stage: "Response",
    });
  });

  it("loads pending request body", async () => {
    const request = makePendingRequest(async () => "resolved body");

    const result = await ensureLoadedHttpMessage(request);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ bodyStatus: "loaded", body: "resolved body", stage: "Request" });
  });

  it("loads pending response and its paired request", async () => {
    const pairedRequest = makePendingRequest(async () => "request body");
    const response = makePendingResponse(async () => "response body", pairedRequest);

    const result = await ensureLoadedHttpMessage(response);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      bodyStatus: "loaded",
      body: "response body",
      stage: "Response",
    });
    const loaded = result as { request: { bodyStatus: string; body: string } };
    expect(loaded.request).toMatchObject({ bodyStatus: "loaded", body: "request body" });
  });

  it("returns Error when pending request getBody fails", async () => {
    const request = makePendingRequest(async () => new Error("load failed"));

    const result = await ensureLoadedHttpMessage(request);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("load failed");
  });

  it("returns Error when pending response getBody fails", async () => {
    const response = makePendingResponse(async () => new Error("response load failed"));

    const result = await ensureLoadedHttpMessage(response);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("response load failed");
  });

  it("returns Error when paired request getBody fails during response loading", async () => {
    const pairedRequest = makePendingRequest(async () => new Error("request load failed"));
    const response = makePendingResponse(async () => "response ok", pairedRequest);

    const result = await ensureLoadedHttpMessage(response);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("request load failed");
  });

  it("strips getBody and _requestPausedEvent from loaded result", async () => {
    const request = makePendingRequest(async () => "body");

    const result = await ensureLoadedHttpMessage(request);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).not.toHaveProperty("getBody");
    expect(result).not.toHaveProperty("_requestPausedEvent");
  });
});
