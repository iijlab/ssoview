/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { describe, expect, it, vi } from "vitest";
import { type HttpRequest, type HttpResponse } from "@/core/http/http-message.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
  extractSamlpAuthnRequestXml,
  extractSamlpResponseXml,
} from "./saml-signal-detector.ts";

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

const RESPONSE_ID = "response-1";

const STATUS_SUCCESS = "urn:oasis:names:tc:SAML:2.0:status:Success";

const RESPONSE_XML = [
  "<samlp:Response",
  '  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"',
  `  ID="${RESPONSE_ID}"`,
  `  InResponseTo="${AUTHN_REQUEST_ID}">`,
  "  <samlp:Status>",
  `    <samlp:StatusCode Value="${STATUS_SUCCESS}"/>`,
  "  </samlp:Status>",
  "</samlp:Response>",
].join("");

// An unsolicited response, which is how an IdP-initiated flow starts. It has no InResponseTo.
const UNSOLICITED_RESPONSE_XML = [
  "<samlp:Response",
  '  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"',
  `  ID="${RESPONSE_ID}">`,
  "  <samlp:Status>",
  `    <samlp:StatusCode Value="${STATUS_SUCCESS}"/>`,
  "  </samlp:Status>",
  "</samlp:Response>",
].join("");

const DATE_HEADER_VALUE = "Thu, 01 Jan 2026 00:00:00 GMT";

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

async function makeIdpLocationUrl(encodedAuthnRequest?: string): Promise<string> {
  const encoded = encodedAuthnRequest ?? (await deflateAndBase64Encode(AUTHN_REQUEST_XML));
  return `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
}

function makeSamlRequestFormBody(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return `<html><body><form action="https://idp.example.org/sso"><input name="SAMLRequest" value="${encoded}"/></form></body></html>`;
}

function makeSamlRequestFormBodyWithUpperCaseAttributes(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return `<HTML><BODY Onload="document.forms[0].submit()"><FORM METHOD="POST" ACTION="https://idp.example.org/sso"><INPUT TYPE="HIDDEN" NAME="SAMLRequest"\nVALUE="${encoded}"></FORM></BODY></HTML>`;
}

function makeSamlRequestPostBody(): string {
  const encoded = Base64.encode(AUTHN_REQUEST_XML);
  return new URLSearchParams({ SAMLRequest: encoded }).toString();
}

async function makeSpLocationUrlWithResponse(): Promise<string> {
  const encoded = await deflateAndBase64Encode(RESPONSE_XML);
  return `https://sp.example.com/acs?SAMLResponse=${encodeURIComponent(encoded)}`;
}

async function makeSamlRequestOnclickBody(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  const escapedUrl = url.replace(/&/g, "&amp;");
  return `<html><body><button onclick="location.href=&quot;${escapedUrl}&quot;">Login</button></body></html>`;
}

async function makeSamlRequestMetaRefreshBody(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  return `<html><head><meta http-equiv="refresh" content="0;url=${url}"></head><body></body></html>`;
}

async function makeSamlRequestMetaRefreshBodyWithEscapedQuotes(): Promise<string> {
  const encoded = await deflateAndBase64Encode(AUTHN_REQUEST_XML);
  const url = `https://idp.example.org/sso?SAMLRequest=${encodeURIComponent(encoded)}`;
  return `<html><head><meta http-equiv=\\"refresh\\" content=\\"0;url=${url}\\"></head><body></body></html>`;
}

function makeSamlResponseFormBody(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return `<html><body><form><input name="SAMLResponse" value="${encoded}"/></form></body></html>`;
}

function makeSamlResponseFormBodyWithUpperCaseAttributes(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return `<HTML><BODY Onload="document.forms[0].submit()"><FORM METHOD="POST" ACTION="https://sp.example.com/acs"><INPUT TYPE="HIDDEN" NAME="SAMLResponse"\nVALUE="${encoded}"></FORM></BODY></HTML>`;
}

function makeSamlResponsePostBody(): string {
  const encoded = Base64.encode(RESPONSE_XML);
  return new URLSearchParams({ SAMLResponse: encoded }).toString();
}

function makeUnsolicitedSamlResponsePostBody(): string {
  const encoded = Base64.encode(UNSOLICITED_RESPONSE_XML);
  return new URLSearchParams({ SAMLResponse: encoded }).toString();
}

//
// Tests
//

describe("detectSamlSignal", () => {
  describe("non-SAML messages", () => {
    it("returns undefined for a plain GET request", async () => {
      const result = await detectSamlSignalFromHttpRequest(makeRequest());
      expect(result).toBeUndefined();
    });

    it("returns undefined for a plain 200 response", async () => {
      const result = await detectSamlSignalFromHttpResponse(makeResponse(), makeRequest());
      expect(result).toBeUndefined();
    });

    it("returns undefined for a POST request without SAMLResponse", async () => {
      const request = makeRequest({ method: "POST", body: "username=user&password=pass" });
      const result = await detectSamlSignalFromHttpRequest(request);
      expect(result).toBeUndefined();
    });

    it("returns undefined for an HTML response whose body was not retrieved", async () => {
      const response = makeResponse({
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: undefined,
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });
  });

  describe("Step 2: IncomingSamlAuthnRequest (SP issues AuthnRequest via redirect)", () => {
    it("detects AuthnRequest in a 302 redirect", async () => {
      const location = await makeIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("detects AuthnRequest in a 307 redirect", async () => {
      const location = await makeIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 307,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("detects AuthnRequest in a 303 redirect", async () => {
      const location = await makeIdpLocationUrl();
      const response = makeResponse({
        url: "https://sp.example.com/login",
        statusCode: 303,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined for non-redirect status codes", async () => {
      const location = await makeIdpLocationUrl();
      const response = makeResponse({
        statusCode: 200,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });

    it("returns undefined when Location header is missing", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const response = makeResponse({
        statusCode: 302,
        headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });

    it("returns Error when AuthnRequest XML has no ID attribute", async () => {
      const noIdXml = '<samlp:AuthnRequest Version="2.0"></samlp:AuthnRequest>';
      const encoded = await deflateAndBase64Encode(noIdXml);
      const location = await makeIdpLocationUrl(encoded);
      const response = makeResponse({
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("ID not found in AuthnRequest");
    });
  });

  describe("Step 2: IncomingSamlAuthnRequest (SP issues AuthnRequest via POST Binding)", () => {
    it("detects AuthnRequest in an HTML form body", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: makeSamlRequestFormBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: makeSamlRequestFormBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });

    it("detects AuthnRequest with upper-case HTML attributes", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: makeSamlRequestFormBodyWithUpperCaseAttributes(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });
  });

  describe("Step 2: IncomingSamlAuthnRequest (SP issues AuthnRequest via Script Redirect Binding)", () => {
    it("detects AuthnRequest in an onclick location.href", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await makeSamlRequestOnclickBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await makeSamlRequestOnclickBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });
  });

  describe("Step 2: IncomingSamlAuthnRequest (SP issues AuthnRequest via Meta Refresh Binding)", () => {
    it("detects AuthnRequest in a meta refresh tag", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await makeSamlRequestMetaRefreshBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("detects AuthnRequest in a meta refresh tag with escaped quotes", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await makeSamlRequestMetaRefreshBodyWithEscapedQuotes(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 2, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const response = makeResponse({
        url: "https://sp.example.com/login",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: await makeSamlRequestMetaRefreshBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });
  });

  describe("Step 3: OutgoingSamlAuthnRequest (UA redirects AuthnRequest to IdP)", () => {
    it("detects AuthnRequest in a GET request URL", async () => {
      const url = await makeIdpLocationUrl();
      const request = makeRequest({ url, method: "GET" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 3, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined for non-GET request", async () => {
      const url = await makeIdpLocationUrl();
      const request = makeRequest({ url, method: "POST", body: "" });

      const result = await detectSamlSignalFromHttpRequest(request);

      // POST without SAMLResponse in body => undefined
      expect(result).toBeUndefined();
    });

    it("returns undefined for GET without SAMLRequest", async () => {
      const request = makeRequest({ url: "https://idp.example.org/sso?foo=bar" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 3: OutgoingSamlAuthnRequest (UA posts AuthnRequest to IdP via POST Binding)", () => {
    it("detects AuthnRequest in a POST request body", async () => {
      const request = makeRequest({
        url: "https://idp.example.org/sso",
        method: "POST",
        body: makeSamlRequestPostBody(),
      });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 3, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined when POST body has no SAMLRequest", async () => {
      const request = makeRequest({
        url: "https://idp.example.org/sso",
        method: "POST",
        body: "username=user&password=pass",
      });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 4: IncomingSamlResponse (IdP issues SAML Response via Redirect Binding)", () => {
    it("detects SAMLResponse in a 302 redirect", async () => {
      const location = await makeSpLocationUrlWithResponse();
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        statusCode: 302,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 4,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("detects SAMLResponse in a 307 redirect", async () => {
      const location = await makeSpLocationUrlWithResponse();
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        statusCode: 307,
        headers: [
          { name: "Location", value: location },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 4,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
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

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });
  });

  describe("Step 4: IncomingSamlResponse (IdP issues SAML Response via POST Binding)", () => {
    it("detects SAMLResponse in HTML response body", async () => {
      const requestUrl = await makeIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        headers: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: makeSamlResponseFormBody(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 4,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("detects SAMLResponse with reversed attribute order", async () => {
      const requestUrl = await makeIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const encoded = Base64.encode(RESPONSE_XML);
      const body = `<html><body><form><input value="${encoded}" name="SAMLResponse"/></form></body></html>`;
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body,
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).toEqual({
        step: 4,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("returns undefined when Content-Type is not text/html", async () => {
      const requestUrl = await makeIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse({
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: "{}",
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).toBeUndefined();
    });

    it("returns undefined when body has no SAMLResponse form field", async () => {
      const requestUrl = await makeIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: "<html><body>No SAML here</body></html>",
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).toBeUndefined();
    });

    it("detects SAMLResponse with upper-case HTML attributes", async () => {
      const requestUrl = await makeIdpLocationUrl();
      const request = makeRequest({ url: requestUrl, method: "GET" });
      const response = makeResponse({
        url: "https://idp.example.org/sso",
        headers: [
          { name: "Content-Type", value: "text/html" },
          { name: "Date", value: DATE_HEADER_VALUE },
        ],
        body: makeSamlResponseFormBodyWithUpperCaseAttributes(),
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 4,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });
  });

  describe("Step 5: OutgoingSamlResponse (UA redirects SAML Response to SP via Redirect Binding)", () => {
    it("detects SAMLResponse in a GET request URL", async () => {
      const url = await makeSpLocationUrlWithResponse();
      const request = makeRequest({ url, method: "GET" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 5,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("returns undefined for GET without SAMLResponse", async () => {
      const request = makeRequest({ url: "https://sp.example.com/acs?foo=bar", method: "GET" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeUndefined();
    });
  });

  describe("Step 5: OutgoingSamlResponse (UA redirects SAML Response to SP via POST Binding)", () => {
    it("detects SAMLResponse in POST request body", async () => {
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body: makeSamlResponsePostBody(),
      });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 5,
        correlationKey: AUTHN_REQUEST_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("returns undefined for non-POST request", async () => {
      const request = makeRequest({ method: "GET" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeUndefined();
    });

    it("returns undefined when POST body has no SAMLResponse", async () => {
      const request = makeRequest({ method: "POST", body: "foo=bar" });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeUndefined();
    });

    it("uses the Response ID as the correlation key when there is no InResponseTo", async () => {
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body: makeUnsolicitedSamlResponsePostBody(),
      });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({
        step: 5,
        correlationKey: RESPONSE_ID,
        samlStatusCode: STATUS_SUCCESS,
      });
    });

    it("returns Error when SAML Response XML has no ID", async () => {
      const noIdXml = '<samlp:Response Version="2.0"></samlp:Response>';
      const encoded = Base64.encode(noIdXml);
      const body = new URLSearchParams({ SAMLResponse: encoded }).toString();
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body,
      });

      const result = await detectSamlSignalFromHttpRequest(request);

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("ID not found in Response");
    });
  });

  describe("Step 6: AuthenticatedResourceResponse (SP returns resource)", () => {
    it("detects response to an OutgoingSamlResponse request", async () => {
      const request = makeRequest({
        url: "https://sp.example.com/acs",
        method: "POST",
        body: makeSamlResponsePostBody(),
      });
      const response = makeResponse({
        url: "https://sp.example.com/acs",
        headers: [{ name: "Date", value: DATE_HEADER_VALUE }],
        body: "<html><body>Welcome</body></html>",
      });

      const result = await detectSamlSignalFromHttpResponse(response, request);

      expect(result).not.toBeInstanceOf(Error);
      expect(result).toEqual({ step: 6, correlationKey: AUTHN_REQUEST_ID });
    });

    it("returns undefined when request is not an OutgoingSamlResponse", async () => {
      const response = makeResponse({
        body: "<html><body>Welcome</body></html>",
      });

      const result = await detectSamlSignalFromHttpResponse(response, makeRequest());

      expect(result).toBeUndefined();
    });
  });
});

describe("extractSamlpAuthnRequestXml", () => {
  it("extracts XML from a redirect response Location URL", async () => {
    const location = await makeIdpLocationUrl();
    const response = makeResponse({
      url: "https://sp.example.com/login",
      statusCode: 302,
      headers: [
        { name: "Location", value: location },
        { name: "Date", value: DATE_HEADER_VALUE },
      ],
    });

    const result = await extractSamlpAuthnRequestXml(response);

    expect(result).toBe(AUTHN_REQUEST_XML);
  });

  it("extracts XML from an HTML form response body", async () => {
    const response = makeResponse({
      url: "https://sp.example.com/login",
      headers: [
        { name: "Content-Type", value: "text/html" },
        { name: "Date", value: DATE_HEADER_VALUE },
      ],
      body: makeSamlRequestFormBody(),
    });

    const result = await extractSamlpAuthnRequestXml(response);

    expect(result).toBe(AUTHN_REQUEST_XML);
  });

  it("extracts XML from a GET request URL", async () => {
    const url = await makeIdpLocationUrl();
    const request = makeRequest({ url, method: "GET" });

    const result = await extractSamlpAuthnRequestXml(request);

    expect(result).toBe(AUTHN_REQUEST_XML);
  });

  it("extracts XML from a POST request body", async () => {
    const request = makeRequest({
      url: "https://idp.example.org/sso",
      method: "POST",
      body: makeSamlRequestPostBody(),
    });

    const result = await extractSamlpAuthnRequestXml(request);

    expect(result).toBe(AUTHN_REQUEST_XML);
  });

  it("returns undefined for a request without SAMLRequest", async () => {
    const result = await extractSamlpAuthnRequestXml(makeRequest());
    expect(result).toBeUndefined();
  });

  it("returns undefined for a response without SAMLRequest", async () => {
    const result = await extractSamlpAuthnRequestXml(makeResponse());
    expect(result).toBeUndefined();
  });
});

describe("extractSamlpResponseXml", () => {
  it("extracts XML from a redirect response Location URL", async () => {
    const location = await makeSpLocationUrlWithResponse();
    const response = makeResponse({
      url: "https://idp.example.org/sso",
      statusCode: 302,
      headers: [
        { name: "Location", value: location },
        { name: "Date", value: DATE_HEADER_VALUE },
      ],
    });

    const result = await extractSamlpResponseXml(response);

    expect(result).toBe(RESPONSE_XML);
  });

  it("extracts XML from an HTML form response body", async () => {
    const response = makeResponse({
      url: "https://idp.example.org/sso",
      headers: [
        { name: "Content-Type", value: "text/html" },
        { name: "Date", value: DATE_HEADER_VALUE },
      ],
      body: makeSamlResponseFormBody(),
    });

    const result = await extractSamlpResponseXml(response);

    expect(result).toBe(RESPONSE_XML);
  });

  it("extracts XML from a GET request URL", async () => {
    const url = await makeSpLocationUrlWithResponse();
    const request = makeRequest({ url, method: "GET" });

    const result = await extractSamlpResponseXml(request);

    expect(result).toBe(RESPONSE_XML);
  });

  it("extracts XML from a POST request body", async () => {
    const request = makeRequest({
      url: "https://sp.example.com/acs",
      method: "POST",
      body: makeSamlResponsePostBody(),
    });

    const result = await extractSamlpResponseXml(request);

    expect(result).toBe(RESPONSE_XML);
  });

  it("returns undefined for a request without SAMLResponse", async () => {
    const result = await extractSamlpResponseXml(makeRequest());
    expect(result).toBeUndefined();
  });

  it("returns undefined for a response without SAMLResponse", async () => {
    const result = await extractSamlpResponseXml(makeResponse());
    expect(result).toBeUndefined();
  });
});
