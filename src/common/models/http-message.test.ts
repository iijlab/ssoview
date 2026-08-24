/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { Base64 } from "js-base64";
import { describe, expect, it } from "vitest";
import type { HttpRequest } from "./http-message.ts";
import { getHeaderValue, isHttpMessage, newHttpRequest, newHttpResponse } from "./http-message.ts";

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    stage: "Request",
    fetchRequestId: "req-1",
    url: "https://example.com/",
    method: "GET",
    headers: [],
    body: "",
    ...overrides,
  } as unknown as HttpRequest;
}

function makeRequestPausedEvent(
  request: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): Protocol.Fetch.RequestPausedEvent {
  return {
    requestId: "req-1",
    request: {
      url: "https://example.com/",
      method: "GET",
      headers: { Host: "example.com" },
      ...request,
    },
    ...overrides,
  } as unknown as Protocol.Fetch.RequestPausedEvent;
}

//
// Tests
//

describe("isHttpMessage", () => {
  const validHttpRequest = {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    fetchRequestId: "req-123",
    headers: [{ name: "Content-Type", value: "text/html" }],
    url: "https://example.com/",
    method: "GET",
    stage: "Request",
    body: "",
  };

  const validHttpResponse = {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    fetchRequestId: "req-123",
    headers: [{ name: "Content-Type", value: "text/html" }],
    url: "https://example.com/",
    method: "GET",
    stage: "Response",
    statusCode: 200,
    body: "<html></html>",
    request: validHttpRequest,
  };

  it("returns true for valid HttpRequest", () => {
    expect(isHttpMessage(validHttpRequest)).toBe(true);
  });

  it("returns true for valid HttpResponse", () => {
    expect(isHttpMessage(validHttpResponse)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isHttpMessage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isHttpMessage(undefined)).toBe(false);
  });

  it("returns false when createdAt is missing", () => {
    const { createdAt, ...msg } = validHttpRequest;
    expect(isHttpMessage(msg)).toBe(false);
  });

  // A missing body means it was not retrieved. JSON round-trips drop the key.
  it("returns true when body is missing", () => {
    const { body, ...msg } = validHttpRequest;
    expect(isHttpMessage(msg)).toBe(true);
  });

  it("returns false when body is not a string", () => {
    const msg = { ...validHttpRequest, body: 123 };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when stage is invalid", () => {
    const msg = { ...validHttpRequest, stage: "Invalid" };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when headers is not an array", () => {
    const msg = { ...validHttpRequest, headers: "invalid" };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false when headers contains invalid entry", () => {
    const msg = { ...validHttpRequest, headers: [{ name: "Content-Type" }] };
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false for Response without statusCode", () => {
    const { statusCode, ...msg } = validHttpResponse;
    expect(isHttpMessage(msg)).toBe(false);
  });

  it("returns false for Response with invalid request", () => {
    const msg = { ...validHttpResponse, request: { invalid: true } };
    expect(isHttpMessage(msg)).toBe(false);
  });
});

describe("getHeaderValue", () => {
  const httpMessage = makeRequest({
    headers: [
      { name: "Content-Type", value: "text/html" },
      { name: "X-Custom-Header", value: "custom-value" },
      { name: "Cache-Control", value: "no-cache" },
    ],
  });

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

describe("newHttpRequest", () => {
  it("carries over the request attributes", () => {
    const requestPausedEvent = makeRequestPausedEvent({
      url: "https://sp.example.com/SAML2/ACS",
      method: "POST",
    });

    const httpRequest = newHttpRequest(requestPausedEvent);

    expect(httpRequest).toMatchObject({
      imported: false,
      stage: "Request",
      fetchRequestId: "req-1",
      url: "https://sp.example.com/SAML2/ACS",
      method: "POST",
    });
  });

  it("converts headers from an object to entries", () => {
    const requestPausedEvent = makeRequestPausedEvent({
      headers: { Host: "example.com", "Content-Type": "text/html" },
    });

    const httpRequest = newHttpRequest(requestPausedEvent);

    expect(httpRequest.headers).toEqual([
      { name: "Host", value: "example.com" },
      { name: "Content-Type", value: "text/html" },
    ]);
  });

  it("returns an empty body when the request has no post data", () => {
    const httpRequest = newHttpRequest(makeRequestPausedEvent());

    expect(httpRequest.body).toBe("");
  });

  it("returns an empty body when postDataEntries is missing", () => {
    const httpRequest = newHttpRequest(makeRequestPausedEvent({ hasPostData: true }));

    expect(httpRequest.body).toBe("");
  });

  it("decodes and concatenates postDataEntries", () => {
    const requestPausedEvent = makeRequestPausedEvent({
      hasPostData: true,
      postDataEntries: [
        { bytes: Base64.encode("SAMLResponse=abc") },
        { bytes: Base64.encode("&RelayState=xyz") },
      ],
    });

    const httpRequest = newHttpRequest(requestPausedEvent);

    expect(httpRequest.body).toBe("SAMLResponse=abc&RelayState=xyz");
  });

  it("skips postDataEntries without bytes", () => {
    const requestPausedEvent = makeRequestPausedEvent({
      hasPostData: true,
      postDataEntries: [{ bytes: Base64.encode("a") }, {}, { bytes: Base64.encode("b") }],
    });

    const httpRequest = newHttpRequest(requestPausedEvent);

    expect(httpRequest.body).toBe("ab");
  });
});

describe("newHttpResponse", () => {
  it("carries over the response attributes", () => {
    const requestPausedEvent = makeRequestPausedEvent(
      {},
      {
        responseStatusCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html" }],
      },
    );

    const httpResponse = newHttpResponse(
      requestPausedEvent,
      200,
      { body: "<html></html>", base64Encoded: false },
      makeRequest(),
    );

    expect(httpResponse).toMatchObject({
      imported: false,
      stage: "Response",
      fetchRequestId: "req-1",
      statusCode: 200,
      headers: [{ name: "Content-Type", value: "text/html" }],
      body: "<html></html>",
    });
  });

  it("returns empty headers when responseHeaders is missing", () => {
    const httpResponse = newHttpResponse(
      makeRequestPausedEvent({}, { responseStatusCode: 200 }),
      200,
      { body: "", base64Encoded: false },
      makeRequest(),
    );

    expect(httpResponse).toMatchObject({ headers: [] });
  });

  it("decodes a base64 encoded response body", () => {
    const httpResponse = newHttpResponse(
      makeRequestPausedEvent({}, { responseStatusCode: 200 }),
      200,
      { body: Base64.encode("<html></html>"), base64Encoded: true },
      makeRequest(),
    );

    expect(httpResponse).toMatchObject({ body: "<html></html>" });
  });

  it("carries over the given paired request", () => {
    const httpRequest = makeRequest({
      url: "https://sp.example.com/SAML2/ACS",
      method: "POST",
      body: "SAMLResponse=abc",
    });

    const httpResponse = newHttpResponse(
      makeRequestPausedEvent({}, { responseStatusCode: 200 }),
      200,
      { body: "", base64Encoded: false },
      httpRequest,
    );

    expect(httpResponse.request).toBe(httpRequest);
  });

  it("leaves the body undefined when the response body is not given", () => {
    const httpResponse = newHttpResponse(
      makeRequestPausedEvent({}, { responseStatusCode: 302 }),
      302,
      undefined,
      makeRequest(),
    );

    expect(httpResponse.statusCode).toBe(302);
    expect(httpResponse.body).toBeUndefined();
  });
});
