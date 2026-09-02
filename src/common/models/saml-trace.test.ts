/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { isSamlTrace, newSamlTrace } from "./saml-trace.ts";

describe("isSamlTrace", () => {
  function makeTraceFields(): Record<string, unknown> {
    return {
      id: "trace-1",
      flowId: "flow-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
      step: 2,
      type: "IncomingAuthnRequest",
    };
  }

  it("returns true for valid SamlTrace with required fields only", () => {
    expect(isSamlTrace(makeTraceFields())).toBe(true);
  });

  it("returns true for valid SamlTrace with optional fields", () => {
    const msg = {
      ...makeTraceFields(),
      date: "2026-01-01",
      sp: "sp.example.com",
      idp: "idp.example.org",
    };
    expect(isSamlTrace(msg)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSamlTrace(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSamlTrace(undefined)).toBe(false);
  });

  it("returns false when id is missing", () => {
    const msg = makeTraceFields();
    delete msg.id;
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when flowId is missing", () => {
    const msg = makeTraceFields();
    delete msg.flowId;
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when httpMessageId is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), httpMessageId: 123 })).toBe(false);
  });

  it("returns false when observedAt is missing", () => {
    const msg = makeTraceFields();
    delete msg.observedAt;
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when serverHostname is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), serverHostname: null })).toBe(false);
  });

  it("returns false when sessionId is missing", () => {
    const msg = makeTraceFields();
    delete msg.sessionId;
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when sessionId is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), sessionId: 123 })).toBe(false);
  });

  it("returns false when createdAt is missing", () => {
    const msg = makeTraceFields();
    delete msg.createdAt;
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when imported is not a boolean", () => {
    expect(isSamlTrace({ ...makeTraceFields(), imported: "false" })).toBe(false);
  });

  it("returns false when optional date is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), date: 12345 })).toBe(false);
  });

  it("returns false when optional sp is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), sp: null })).toBe(false);
  });

  it("returns false when optional idp is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), idp: { name: "idp" } })).toBe(false);
  });

  it("returns false when optional samlStatusCode is not a string", () => {
    expect(isSamlTrace({ ...makeTraceFields(), samlStatusCode: 200 })).toBe(false);
  });
});

describe("newSamlTrace", () => {
  const DATE_HEADER_VALUE = "Thu, 01 Jan 2026 00:00:00 GMT";
  const DATE_ISO = "2026-01-01T00:00:00.000Z";
  const STATUS_SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success";

  function makeRequest(overrides: Record<string, unknown> = {}): HttpRequest {
    return {
      id: "msg-1",
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

  function makeResponse(overrides: Record<string, unknown> = {}): HttpResponse {
    return {
      id: "msg-1",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      stage: "Response",
      fetchRequestId: "req-1",
      headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
      url: "https://sp.example.com/",
      method: "GET",
      statusCode: 200,
      body: "",
      ...overrides,
    } as unknown as HttpResponse;
  }

  it("builds a step 1 trace from a request", () => {
    const request = makeRequest({ url: "https://sp.example.com/resource" });

    const result = newSamlTrace("flow-1", { step: 1, correlationKey: "authn-req-1" }, request);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      flowId: "flow-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      sessionId: "authn-req-1",
      imported: false,
      step: 1,
      type: "UnauthenticatedResourceRequest",
      action: "User Agent requests a secured resource at Service Provider",
    });
  });

  it("builds a step 2 trace from a response", () => {
    const response = makeResponse({ url: "https://sp.example.com/login" });

    const result = newSamlTrace("flow-1", { step: 2, correlationKey: "authn-req-1" }, response);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      flowId: "flow-1",
      httpMessageId: "msg-1",
      observedAt: "2026-01-01T00:00:00Z",
      serverHostname: "sp.example.com",
      sessionId: "authn-req-1",
      imported: false,
      step: 2,
      type: "IncomingAuthnRequest",
      date: DATE_ISO,
      sp: "sp.example.com",
      action: "Service Provider issues SAML AuthnRequest",
    });
    expect((result as { id: string }).id).toEqual(expect.any(String));
    expect((result as { createdAt: string }).createdAt).toEqual(expect.any(String));
  });

  it("builds a step 3 trace with the redirect action for a GET request", () => {
    const request = makeRequest({ url: "https://idp.example.org/sso", method: "GET" });

    const result = newSamlTrace("flow-1", { step: 3, correlationKey: "authn-req-1" }, request);

    expect(result).toMatchObject({
      sessionId: "authn-req-1",
      step: 3,
      type: "OutgoingAuthnRequest",
      serverHostname: "idp.example.org",
      idp: "idp.example.org",
      action: "User Agent redirects SAML AuthnRequest to Identity Provider",
    });
  });

  it("builds a step 3 trace with the submit action for a POST request", () => {
    const request = makeRequest({ url: "https://idp.example.org/sso", method: "POST" });

    const result = newSamlTrace("flow-1", { step: 3, correlationKey: "authn-req-1" }, request);

    expect(result).toMatchObject({
      step: 3,
      action: "User Agent submits SAML AuthnRequest to Identity Provider",
    });
  });

  it("builds a step 4 trace with the samlStatusCode", () => {
    const response = makeResponse({ url: "https://idp.example.org/sso" });

    const result = newSamlTrace(
      "flow-1",
      { step: 4, correlationKey: "authn-req-1", samlStatusCode: STATUS_SUCCESS },
      response,
    );

    expect(result).toMatchObject({
      sessionId: "authn-req-1",
      step: 4,
      type: "IncomingResponse",
      date: DATE_ISO,
      idp: "idp.example.org",
      action: "Identity Provider issues SAML Response",
      samlStatusCode: STATUS_SUCCESS,
    });
  });

  it("builds a step 5 trace with the samlStatusCode", () => {
    const request = makeRequest({ url: "https://sp.example.com/acs", method: "POST" });

    const result = newSamlTrace(
      "flow-1",
      { step: 5, correlationKey: "authn-req-1", samlStatusCode: STATUS_SUCCESS },
      request,
    );

    expect(result).toMatchObject({
      sessionId: "authn-req-1",
      step: 5,
      type: "OutgoingResponse",
      sp: "sp.example.com",
      action: "User Agent submits SAML Response to Service Provider",
      samlStatusCode: STATUS_SUCCESS,
    });
  });

  it("builds a step 6 trace from a response", () => {
    const response = makeResponse({ url: "https://sp.example.com/resource" });

    const result = newSamlTrace("flow-1", { step: 6, correlationKey: "authn-req-1" }, response);

    expect(result).toMatchObject({
      sessionId: "authn-req-1",
      step: 6,
      type: "AuthenticatedResourceResponse",
      date: DATE_ISO,
      sp: "sp.example.com",
      action: "Service Provider returns the requested resource",
    });
  });

  it("takes the imported flag from the HTTP message", () => {
    const response = makeResponse({ imported: true });

    const result = newSamlTrace("flow-1", { step: 2, correlationKey: "authn-req-1" }, response);

    expect(result).toMatchObject({ imported: true });
  });

  it("omits the date when the message has no Date header", () => {
    const response = makeResponse({ headers: [] });

    const result = newSamlTrace("flow-1", { step: 2, correlationKey: "authn-req-1" }, response);

    expect(result).not.toBeInstanceOf(Error);
    expect((result as { date?: string }).date).toBeUndefined();
  });

  it("returns Error when the message URL is invalid", () => {
    const response = makeResponse({ url: "not-a-url" });

    const result = newSamlTrace("flow-1", { step: 2, correlationKey: "authn-req-1" }, response);

    expect(result).toBeInstanceOf(Error);
  });
});
