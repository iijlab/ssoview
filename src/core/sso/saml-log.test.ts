/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/core/http/http-message.ts";
import { isSamlLog, newSamlLog } from "./saml-log.ts";

describe("isSamlLog", () => {
  function makeSamlLogFields(): Record<string, unknown> {
    return {
      id: "saml-log-1",
      ssoTraceId: "sso-trace-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      action: "test action",
      step: 2,
      type: "IncomingSamlAuthnRequest",
    };
  }

  it("returns true for valid SamlLog with required fields only", () => {
    expect(isSamlLog(makeSamlLogFields())).toBe(true);
  });

  it("returns true for valid SamlLog with optional fields", () => {
    const msg = { ...makeSamlLogFields(), samlStatusCode: "urn:...:Success" };
    expect(isSamlLog(msg)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSamlLog(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSamlLog(undefined)).toBe(false);
  });

  it("returns false when id is missing", () => {
    const msg = makeSamlLogFields();
    delete msg.id;
    expect(isSamlLog(msg)).toBe(false);
  });

  it("returns false when ssoTraceId is missing", () => {
    const msg = makeSamlLogFields();
    delete msg.ssoTraceId;
    expect(isSamlLog(msg)).toBe(false);
  });

  it("returns false when httpMessageId is not a string", () => {
    expect(isSamlLog({ ...makeSamlLogFields(), httpMessageId: 123 })).toBe(false);
  });

  it("returns false when observedAt is missing", () => {
    const msg = makeSamlLogFields();
    delete msg.observedAt;
    expect(isSamlLog(msg)).toBe(false);
  });

  it("returns false when serverHostname is not a string", () => {
    expect(isSamlLog({ ...makeSamlLogFields(), serverHostname: null })).toBe(false);
  });

  it("returns false when optional samlStatusCode is not a string", () => {
    expect(isSamlLog({ ...makeSamlLogFields(), samlStatusCode: 200 })).toBe(false);
  });
});

describe("newSamlLog", () => {
  const DATE_HEADER_VALUE = "Thu, 01 Jan 2026 00:00:00 GMT";
  const STATUS_SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success";

  function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
    return {
      id: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      type: "Request",
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
      id: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      type: "Response",
      fetchRequestId: "req-1",
      headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
      url: "https://sp.example.com/",
      method: "GET",
      statusCode: 200,
      body: "",
      ...overrides,
    } as unknown as HttpResponse;
  }

  it("creates a step 1 log from a request", () => {
    const request = makeRequest({ url: "https://sp.example.com/resource" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 1, correlationKey: "correlation-key-1" },
      request,
    );

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      ssoTraceId: "sso-trace-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      step: 1,
      type: "UnauthenticatedResourceRequest",
      action: "User Agent requests a secured resource at Service Provider",
    });
  });

  it("creates a step 2 log from a response", () => {
    const response = makeResponse({ url: "https://sp.example.com/login" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 2, correlationKey: "correlation-key-1" },
      response,
    );

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      ssoTraceId: "sso-trace-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      step: 2,
      type: "IncomingSamlAuthnRequest",
      action: "Service Provider issues SAML AuthnRequest",
    });
    expect((result as { id: string }).id).toEqual(expect.any(String));
  });

  it("creates a step 3 log with the redirect action for a GET request", () => {
    const request = makeRequest({ url: "https://idp.example.org/sso", method: "GET" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 3, correlationKey: "correlation-key-1" },
      request,
    );

    expect(result).toMatchObject({
      step: 3,
      type: "OutgoingSamlAuthnRequest",
      serverHostname: "idp.example.org",
      action: "User Agent redirects SAML AuthnRequest to Identity Provider",
    });
  });

  it("creates a step 3 log with the submit action for a POST request", () => {
    const request = makeRequest({ url: "https://idp.example.org/sso", method: "POST" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 3, correlationKey: "correlation-key-1" },
      request,
    );

    expect(result).toMatchObject({
      step: 3,
      action: "User Agent submits SAML AuthnRequest to Identity Provider",
    });
  });

  it("creates a step 4 log with the samlStatusCode", () => {
    const response = makeResponse({ url: "https://idp.example.org/sso" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 4, correlationKey: "correlation-key-1", samlStatusCode: STATUS_SUCCESS },
      response,
    );

    expect(result).toMatchObject({
      step: 4,
      type: "IncomingSamlResponse",
      action: "Identity Provider issues SAML Response",
      samlStatusCode: STATUS_SUCCESS,
    });
  });

  it("creates a step 5 log with the samlStatusCode", () => {
    const request = makeRequest({ url: "https://sp.example.com/acs", method: "POST" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 5, correlationKey: "correlation-key-1", samlStatusCode: STATUS_SUCCESS },
      request,
    );

    expect(result).toMatchObject({
      step: 5,
      type: "OutgoingSamlResponse",
      action: "User Agent submits SAML Response to Service Provider",
      samlStatusCode: STATUS_SUCCESS,
    });
  });

  it("creates a step 6 log from a response", () => {
    const response = makeResponse({ url: "https://sp.example.com/resource" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 6, correlationKey: "correlation-key-1" },
      response,
    );

    expect(result).toMatchObject({
      step: 6,
      type: "AuthenticatedResourceResponse",
      action: "Service Provider returns the requested resource",
    });
  });

  it("returns Error when the message URL is invalid", () => {
    const response = makeResponse({ url: "not-a-url" });

    const result = newSamlLog(
      "sso-trace-1",
      { step: 2, correlationKey: "correlation-key-1" },
      response,
    );

    expect(result).toBeInstanceOf(Error);
  });
});
