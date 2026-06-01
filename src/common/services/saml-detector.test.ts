/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { describe, expect, it, vi } from "vitest";
import type { HttpRequest, HttpResponse } from "@/common/models/http-message.ts";
import { detectSamlStep } from "./saml-detector.ts";

//
// Test fixtures
//

const AUTHN_REQUEST_ID = "authn-req-1";

const AUTHN_REQUEST_XML = [
  "<samlp:AuthnRequest",
  '  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"',
  `  ID="${AUTHN_REQUEST_ID}"`,
  '  Version="2.0">',
  "</samlp:AuthnRequest>",
].join("");

const RESPONSE_XML = [
  "<samlp:Response",
  '  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"',
  `  InResponseTo="${AUTHN_REQUEST_ID}">`,
  "  <samlp:Status>",
  '    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>',
  "  </samlp:Status>",
  "</samlp:Response>",
].join("");

const DATE_HEADER_VALUE = "Thu, 01 Jan 2026 00:00:00 GMT";
const DATE_ISO = "2026-01-01T00:00:00.000Z";

//
// Helpers
//

// Reverse of decodeSamlRedirectBindingMessage: deflate-raw + base64 encode
async function deflateAndBase64Encode(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const blob = await new Response(stream).blob();
  const buffer = await blob.arrayBuffer();
  return Base64.fromUint8Array(new Uint8Array(buffer));
}

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
    headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
    url: "https://sp.example.com/",
    method: "GET",
    statusCode: 200,
    body: "",
    request: request ?? makeRequest(),
    ...overrides,
  } as unknown as HttpResponse;
}

async function buildIdpLocationUrl(encodedAuthnRequest?: string): Promise<string> {
  const encoded = encodedAuthnRequest ?? (await deflateAndBase64Encode(AUTHN_REQUEST_XML));
  return `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
}

function buildSamlRequestFormBody(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return `<html><body><form action="https://idp.example.org/sso"><input name="SAMLRequest" value="${encoded}"/></form></body></html>`;
}

function buildSamlRequestFormBodyWithUpperCaseAttributes(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return `<HTML><BODY Onload="document.forms[0].submit()"><FORM METHOD="POST" ACTION="https://idp.example.org/sso"><INPUT TYPE="HIDDEN" NAME="SAMLRequest"\nVALUE="${encoded}"></FORM></BODY></HTML>`;
}

function buildSamlRequestPostBody(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return new URLSearchParams({ SAMLRequest: encoded }).toString();
}

async function buildSpLocationUrlWithResponse(): Promise<string> {
  const encoded = await deflateAndBase64Encode(RESPONSE_XML);
  return `https://sp.example.com/acs?SAMLResponse=${encodeURIComponent(encoded)}`;
}

async function buildSamlRequestOnclickBody(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  const escapedUrl = url.replace(/&/g, "&amp;");
  return `<html><body><button onclick="location.href=&quot;${escapedUrl}&quot;">Login</button></body></html>`;
}

async function buildSamlRequestMetaRefreshBody(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  return `<html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body></body></html>`;
}

async function buildSamlRequestMetaRefreshBodyWithEscapedQuotes(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  return `<html><head><meta http-equiv=\\"refresh\\" content=\\"0;url=${url}\\"></head><body></body></html>`;
}

function buildSamlResponseFormBody(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return `<html><body><form><input name="SAMLResponse" value="${encoded}"/></form></body></html>`;
}

function buildSamlResponseFormBodyWithUpperCaseAttributes(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return `<HTML><BODY Onload="document.forms[0].submit()"><FORM METHOD="POST" ACTION="https://sp.example.com/acs"><INPUT TYPE="HIDDEN" NAME="SAMLResponse"\nVALUE="${encoded}"></FORM></BODY></HTML>`;
}

function buildSamlResponsePostBody(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return new URLSearchParams({ SAMLResponse: encoded }).toString();
}

//
// Tests
//

describe("detectSamlStep", () => {
  describe("non-SAML messages", () => {
    it("returns undefined for a plain GET request", async () => {
      const result = await detectSamlStep(makeRequest());
      expect(result).toBeUndefined();
    });

    it("returns undefined for a plain 200 response", async () => {
      const result = await detectSamlStep(makeResponse());
      expect(result).toBeUndefined();
    });

    it("returns undefined for a POST request without SAMLResponse", async () => {
      const request = makeRequest({ method: "POST", body: "username=user&password=pass" });
      const result = await detectSamlStep(request);
      expect(result).toBeUndefined();
    });
  });

  describe("Step 2: IncomingAuthnRequest (SP issues AuthnRequest via redirect)", () => {
    it("detects AuthnRequest in a 302 redirect", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        imported: false,
        date: DATE_ISO,
        action: "Service Provider issues SAML AuthnRequest",
      });
    });

    it("detects AuthnRequest in a 307 redirect", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 307,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({ step: 2, type: "IncomingAuthnRequest" });
    });

    it("detects AuthnRequest in a 303 redirect", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 303,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({ step: 2, type: "IncomingAuthnRequest" });
    });

    it("preserves the imported flag from the HTTP message", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 302,
        imported: true,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toMatchObject({ imported: true });
    });

    it("includes authnRequest with id and raw XML", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeUndefined();
      expect(result).not.toBeInstanceOf(Error);
      const saml = result as { authnRequest: { id: string; raw: string } };
      expect(saml.authnRequest.id).toBe(AUTHN_REQUEST_ID);
      expect(saml.authnRequest.raw).toContain(AUTHN_REQUEST_ID);
    });

    it("returns undefined for non-redirect status codes", async () => {
      const location = await buildIdpLocationUrl();
      const response = makeResponse({
        statusCode: 200,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when Location header is missing", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const response = makeResponse({
        statusCode: 302,
        headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
      vi.restoreAllMocks();
    });

    it("returns undefined when Location has no SAMLRequest parameter", async () => {
      const response = makeResponse({
        statusCode: 302,
        headers: [
          { name: "Location", value: "https://idp.example.org/sso?foo=bar" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when Location is a relative URL", async () => {
      const response = makeResponse({
        statusCode: 302,
        headers: [
          { name: "Location", value: "/folder/0" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns Error when AuthnRequest XML has no ID attribute", async () => {
      const noIdXml = '<samlp:AuthnRequest Version="2.0"></samlp:AuthnRequest>';
      const encoded = await deflateAndBase64Encode(noIdXml);
      const location = await buildIdpLocationUrl(encoded);
      const response = makeResponse({
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("ID not found in AuthnRequest");
    });
  });

  describe("Step 2: IncomingAuthnRequest (SP issues AuthnRequest via POST Binding)", () => {
    it("detects AuthnRequest in an HTML form body", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: buildSamlRequestFormBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        imported: false,
        date: DATE_ISO,
        action: "Service Provider issues SAML AuthnRequest",
      });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: buildSamlRequestFormBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when body has no SAMLRequest", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: '<html><body><form><input name="foo" value="bar"/></form></body></html>',
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("detects AuthnRequest with upper-case HTML attributes", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: buildSamlRequestFormBodyWithUpperCaseAttributes(),
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
      });
    });
  });

  describe("Step 2: IncomingAuthnRequest (SP issues AuthnRequest via Script Redirect Binding)", () => {
    it("detects AuthnRequest in an onclick location.href", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await buildSamlRequestOnclickBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        imported: false,
        date: DATE_ISO,
        action: "Service Provider issues SAML AuthnRequest",
      });
    });

    it("returns undefined when onclick has no SAMLRequest", async () => {
      const body =
        '<html><body><button onclick="location.href=&quot;https://example.com&quot;">Login</button></body></html>';
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body,
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await buildSamlRequestOnclickBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 2: IncomingAuthnRequest (SP issues AuthnRequest via Meta Refresh Binding)", () => {
    it("detects AuthnRequest in a meta refresh tag", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await buildSamlRequestMetaRefreshBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        imported: false,
        date: DATE_ISO,
        action: "Service Provider issues SAML AuthnRequest",
      });
    });

    it("detects AuthnRequest in a meta refresh tag with escaped quotes", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await buildSamlRequestMetaRefreshBodyWithEscapedQuotes(),
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 2,
        type: "IncomingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
      });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await buildSamlRequestMetaRefreshBody(),
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when meta refresh URL has no SAMLRequest", async () => {
      const body =
        '<html><head><meta http-equiv="refresh" content="0;url=https://example.com/other"></head><body></body></html>';
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body,
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when body has no meta refresh tag", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: "<html><head></head><body>No meta refresh</body></html>",
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 3: OutgoingAuthnRequest (UA redirects AuthnRequest to IdP)", () => {
    it("detects AuthnRequest in a GET request URL", async () => {
      const url = await buildIdpLocationUrl();
      const request = makeRequest({ url, method: "GET" });

      const result = await detectSamlStep(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 3,
        type: "OutgoingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        idp: "idp.example.org",
        action: "User Agent redirects SAML AuthnRequest to Identity Provider",
      });
    });

    it("returns undefined for non-GET request", async () => {
      const url = await buildIdpLocationUrl();
      const request = makeRequest({ url, method: "POST", body: "" });

      const result = await detectSamlStep(request);

      // POST without SAMLResponse in body => undefined
      expect(result).toBeUndefined();
    });

    it("returns undefined for GET without SAMLRequest", async () => {
      const request = makeRequest({ url: "https://idp.example.org/sso?foo=bar" });

      const result = await detectSamlStep(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 3: OutgoingAuthnRequest (UA posts AuthnRequest to IdP via POST Binding)", () => {
    it("detects AuthnRequest in a POST request body", async () => {
      const request = makeRequest({
        url: "https://idp.example.org/sso",
        method: "POST",
        body: buildSamlRequestPostBody(),
      });

      const result = await detectSamlStep(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 3,
        type: "OutgoingAuthnRequest",
        sessionId: AUTHN_REQUEST_ID,
        idp: "idp.example.org",
        action: "User Agent submits SAML AuthnRequest to Identity Provider",
      });
    });

    it("returns undefined when POST body has no SAMLRequest", async () => {
      const request = makeRequest({
        url: "https://idp.example.org/sso",
        method: "POST",
        body: "username=user&password=pass",
      });

      const result = await detectSamlStep(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 4: IncomingResponse (IdP issues SAML Response via Redirect Binding)", () => {
    it("detects SAMLResponse in a 302 redirect", async () => {
      const location = await buildSpLocationUrlWithResponse();
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 4,
        type: "IncomingResponse",
        sessionId: AUTHN_REQUEST_ID,
        idp: "idp.example.org",
        date: DATE_ISO,
        action: "Identity Provider issues SAML Response",
      });
    });

    it("detects SAMLResponse in a 307 redirect", async () => {
      const location = await buildSpLocationUrlWithResponse();
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        statusCode: 307,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({ step: 4, type: "IncomingResponse" });
    });

    it("returns undefined when Location has no SAMLResponse parameter", async () => {
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        statusCode: 302,
        headers: [
          { name: "Location", value: "https://sp.example.com/acs?foo=bar" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 4: IncomingResponse (IdP issues SAML Response via POST Binding)", () => {
    it("detects SAMLResponse in HTML response body", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse(
        {
          url: "https://idp.example.org/sso",
          headers: [
            { name: "Content-Type", value: "text/html; charset=utf-8" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body: buildSamlResponseFormBody(),
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 4,
        type: "IncomingResponse",
        sessionId: AUTHN_REQUEST_ID,
        idp: "idp.example.org",
        date: DATE_ISO,
        action: "Identity Provider issues SAML Response",
      });
    });

    it("detects SAMLResponse with reversed attribute order", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const encoded = Base64.encode(RESPONSE_XML);
      const body = `<html><body><form><input value="${encoded}" name="SAMLResponse"/></form></body></html>`;
      const response = makeResponse(
        {
          url: "https://idp.example.org/sso",
          headers: [
            { name: "Content-Type", value: "text/html" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body,
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).toMatchObject({ step: 4, type: "IncomingResponse" });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse(
        {
          headers: [
            { name: "Content-Type", value: "application/json" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body: "{}",
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("returns undefined when body has no SAMLResponse form field", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse(
        {
          url: "https://idp.example.org/sso",
          headers: [
            { name: "Content-Type", value: "text/html" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body: "<html><body>No SAML here</body></html>",
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });

    it("includes response with inResponseTo and raw XML", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse(
        {
          url: "https://idp.example.org/sso",
          headers: [
            { name: "Content-Type", value: "text/html" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body: buildSamlResponseFormBody(),
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).not.toBeUndefined();
      expect(result).not.toBeInstanceOf(Error);
      const saml = result as { response: { inResponseTo: string; raw: string } };
      expect(saml.response.inResponseTo).toBe(AUTHN_REQUEST_ID);
      expect(saml.response.raw).toContain(AUTHN_REQUEST_ID);
    });

    it("detects SAMLResponse with upper-case HTML attributes", async () => {
      const requestUrl = await buildIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse(
        {
          url: "https://idp.example.org/sso",
          headers: [
            { name: "Content-Type", value: "text/html" },
            { name: "Date", value: DATE_HEADER_VALUE },
          ],
          body: buildSamlResponseFormBodyWithUpperCaseAttributes(),
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 4,
        type: "IncomingResponse",
        idp: "idp.example.org",
      });
    });
  });

  describe("Step 5: OutgoingResponse (UA redirects SAML Response to SP via Redirect Binding)", () => {
    it("detects SAMLResponse in a GET request URL", async () => {
      const url = await buildSpLocationUrlWithResponse();
      const request = makeRequest({ url, method: "GET" });

      const result = await detectSamlStep(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 5,
        type: "OutgoingResponse",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        action: "User Agent redirects SAML Response to Service Provider",
      });
    });

    it("returns undefined for GET without SAMLResponse", async () => {
      const request = makeRequest({ url: "https://sp.example.com/acs?foo=bar", method: "GET" });

      const result = await detectSamlStep(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 5: OutgoingResponse (UA redirects SAML Response to SP via POST Binding)", () => {
    it("detects SAMLResponse in POST request body", async () => {
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body: buildSamlResponsePostBody(),
      });

      const result = await detectSamlStep(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 5,
        type: "OutgoingResponse",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        action: "User Agent submits SAML Response to Service Provider",
      });
    });

    it("returns undefined for non-POST request", async () => {
      const request = makeRequest({ method: "GET" });

      const result = await detectSamlStep(request);

      expect(result).toBeUndefined();
    });

    it("returns undefined when POST body has no SAMLResponse", async () => {
      const request = makeRequest({ method: "POST", body: "foo=bar" });

      const result = await detectSamlStep(request);

      expect(result).toBeUndefined();
    });

    it("returns Error when SAML Response XML has no InResponseTo", async () => {
      const noInResponseToXml = '<samlp:Response Version="2.0"></samlp:Response>';
      const encoded = Base64.encode(noInResponseToXml);
      const body = new URLSearchParams({ SAMLResponse: encoded }).toString();
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body,
      });

      const result = await detectSamlStep(request);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("InResponseTo not found in Response");
    });
  });

  describe("Step 6: AuthenticatedResourceResponse (SP returns resource)", () => {
    it("detects response to an OutgoingResponse request", async () => {
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body: buildSamlResponsePostBody(),
      });
      const response = makeResponse(
        {
          url: "https://sp.example.com/acs",
          headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
          body: "<html><body>Welcome</body></html>",
        },
        request,
      );

      const result = await detectSamlStep(response);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toMatchObject({
        step: 6,
        type: "AuthenticatedResourceResponse",
        sessionId: AUTHN_REQUEST_ID,
        sp: "sp.example.com",
        date: DATE_ISO,
        action: "Service Provider returns the requested resource",
      });
    });

    it("returns undefined when request is not an OutgoingResponse", async () => {
      const response = makeResponse({
        body: "<html><body>Welcome</body></html>",
      });

      const result = await detectSamlStep(response);

      expect(result).toBeUndefined();
    });
  });
});
