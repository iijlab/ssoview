/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import {
  type HttpMessage,
  type HttpRequest,
  type HttpResponse,
  getHeaderValue,
  getRequestBody,
  getResponseBody,
} from "@/common/models/http-message.ts";
import {
  type AuthenticatedResourceResponse,
  type IncomingSamlAuthnRequest,
  type IncomingSamlResponse,
  type OutgoingSamlAuthnRequest,
  type OutgoingSamlResponse,
  type SamlAuthnRequest,
  type SamlResponse,
  type SamlTrace,
  type UnauthenticatedResourceRequest,
} from "@/common/models/saml-trace.ts";
import { parseSamlpAuthnRequest, parseSamlpResponse } from "./saml-parser.ts";

export async function detectSamlStep(
  httpMessage: HttpMessage,
): Promise<SamlTrace | undefined | Error> {
  if (httpMessage.stage === "Request") {
    return (
      (await detectUnauthenticatedResourceRequest(httpMessage)) ??
      (await detectOutgoingSamlAuthnRequest(httpMessage)) ??
      (await detectOutgoingSamlResponse(httpMessage))
    );
  } else {
    return (
      (await detectIncomingSamlAuthnRequest(httpMessage)) ??
      (await detectIncomingSamlResponse(httpMessage)) ??
      (await detectAuthenticatedResourceResponse(httpMessage))
    );
  }
}

// Step 1: UA ---(resource request)--> SP
//
// A resource request has no SAML marker, so it cannot be detected from the
// request alone. Whether it is SAML-related is determined by whether the
// response contains an AuthnRequest.
async function detectUnauthenticatedResourceRequest(
  _: HttpRequest,
): Promise<UnauthenticatedResourceRequest | undefined | Error> {
  return undefined;
}

// Step 2: UA <--(AuthnRequest)--- SP
async function detectIncomingSamlAuthnRequest(
  httpResponse: HttpResponse,
): Promise<IncomingSamlAuthnRequest | undefined | Error> {
  return (
    (await detectIncomingSamlAuthnRequestForHttpRedirectBinding(httpResponse)) ??
    (await detectIncomingSamlAuthnRequestForHttpPostBinding(httpResponse)) ??
    (await detectIncomingSamlAuthnRequestForScriptRedirectBinding(httpResponse)) ??
    (await detectIncomingSamlAuthnRequestForMetaRefreshBinding(httpResponse))
  );
}

// Step 2 (HTTP Redirect Binding): UA <--(AuthnRequest)--- SP
//
// Detected when:
// - It is a redirect response
// - The Location URL query string contains SAMLRequest
async function detectIncomingSamlAuthnRequestForHttpRedirectBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlAuthnRequest | undefined | Error> {
  if (
    httpResponse.statusCode !== 302 &&
    httpResponse.statusCode !== 303 &&
    httpResponse.statusCode !== 307
  ) {
    return undefined;
  }

  const location = getHeaderValue(httpResponse, "Location");
  if (!location) {
    console.warn("No Location header:", { headers: httpResponse.headers });
    return undefined;
  }

  const encodedSamlAuthnRequest = getQueryParameterValue(location, "SAMLRequest");
  if (encodedSamlAuthnRequest === undefined) {
    return undefined;
  } else if (encodedSamlAuthnRequest instanceof Error) {
    console.warn("Failed to get SAMLRequest value from location:", {
      location,
      error: encodedSamlAuthnRequest,
    });
    return undefined;
  }

  const samlAuthnRequestStr = await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const sp = getHostname(httpResponse.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 2,
    type: "IncomingAuthnRequest",
    date: getResponseDate(httpResponse),
    sp,
    action: "Service Provider issues SAML AuthnRequest",
    authnRequest: samlAuthnRequest,
  };
}

// Step 2 (HTTP POST Binding):  UA <--(AuthnRequest)--- SP
//
// Detected when:
// - The response body is HTML
// - A form in that HTML has a parameter named SAMLRequest
async function detectIncomingSamlAuthnRequestForHttpPostBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlAuthnRequest | undefined | Error> {
  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const responseBody = await getResponseBody(httpResponse);
  if (responseBody instanceof Error) {
    return responseBody;
  }

  const encodedSamlAuthnRequest = extractSamlRequestFromResponseBody(responseBody);
  if (!encodedSamlAuthnRequest) {
    return undefined;
  }

  const samlAuthnRequestStr = decodeBase64(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const sp = getHostname(httpResponse.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 2,
    type: "IncomingAuthnRequest",
    date: getResponseDate(httpResponse),
    sp,
    action: "Service Provider issues SAML AuthnRequest",
    authnRequest: samlAuthnRequest,
  };
}

function extractSamlRequestFromResponseBody(responseBody: string): string | undefined {
  return (
    responseBody.match(/name="SAMLRequest"\s+value="([^"]+)"/i)?.[1] ||
    responseBody.match(/value="([^"]+)"\s+name="SAMLRequest"/i)?.[1]
  );
}

// Step 2 (Script Redirect Binding): UA <--(AuthnRequest)--- SP
//
// A non-standard method used by some sites that navigates via location.href.
// Presumably they want navigation to be triggered by a user action such as a click.
// The SAMLRequest is encoded the same way as in the HTTP Redirect Binding.
//
// Detected when:
// - The response body is HTML
// - A URL is specified via location.href in that HTML
// - The query string of that URL contains SAMLRequest
// - e.g. <button onclick="location.href=&quot;https://idp.example.org/saml2?SAMLRequest=...&quot;">
async function detectIncomingSamlAuthnRequestForScriptRedirectBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlAuthnRequest | undefined | Error> {
  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const responseBody = await getResponseBody(httpResponse);
  if (responseBody instanceof Error) {
    return responseBody;
  }

  const matched = responseBody.match(/"location\.href=&quot;([^"]*SAMLRequest=[^"]*)&quot;"/);
  if (!matched?.[1]) {
    return undefined;
  }

  const href = matched[1].replace(/&amp;/g, "&");
  const encodedSamlAuthnRequest = getQueryParameterValue(href, "SAMLRequest");
  if (encodedSamlAuthnRequest === undefined) {
    return undefined;
  } else if (encodedSamlAuthnRequest instanceof Error) {
    console.warn("Failed to get SAMLRequest value from location.href:", {
      href,
      error: encodedSamlAuthnRequest,
    });
    return undefined;
  }

  const samlAuthnRequestStr = await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const sp = getHostname(httpResponse.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 2,
    type: "IncomingAuthnRequest",
    date: getResponseDate(httpResponse),
    sp,
    action: "Service Provider issues SAML AuthnRequest",
    authnRequest: samlAuthnRequest,
  };
}

// Step 2 (Meta Refresh Binding): UA <--(AuthnRequest)--- SP
//
// A non-standard method used by some sites that navigates via <meta http-equiv="refresh">.
// The SAMLRequest is encoded the same way as in the HTTP Redirect Binding.
//
// Detected when:
// - The response body is HTML
// - A URL is specified via <meta http-equiv="refresh"> in that HTML
// - The query string of that URL contains SAMLRequest
async function detectIncomingSamlAuthnRequestForMetaRefreshBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlAuthnRequest | undefined | Error> {
  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const responseBody = await getResponseBody(httpResponse);
  if (responseBody instanceof Error) {
    return responseBody;
  }

  const url = extractUrlFromMetaRefresh(responseBody);
  if (!url) {
    return undefined;
  }

  const encodedSamlAuthnRequest = getQueryParameterValue(url, "SAMLRequest");
  if (encodedSamlAuthnRequest === undefined) {
    return undefined;
  } else if (encodedSamlAuthnRequest instanceof Error) {
    console.warn("Failed to get SAMLRequest value from meta refresh URL:", {
      url,
      error: encodedSamlAuthnRequest,
    });
    return undefined;
  }

  const samlAuthnRequestStr = await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const sp = getHostname(httpResponse.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 2,
    type: "IncomingAuthnRequest",
    date: getResponseDate(httpResponse),
    sp,
    action: "Service Provider issues SAML AuthnRequest",
    authnRequest: samlAuthnRequest,
  };
}

function extractUrlFromMetaRefresh(responseBody: string): string | undefined {
  const matched = responseBody.match(
    /<meta\s+http-equiv=\\?"refresh\\?"\s+content=\\?"[^;]*;\s*url=([^"\\]+)/i,
  );
  return matched?.[1];
}

// Step 3: UA ---(AuthnRequest)--> IdP
async function detectOutgoingSamlAuthnRequest(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlAuthnRequest | undefined | Error> {
  return (
    (await detectOutgoingSamlAuthnRequestForRedirectBinding(httpRequest)) ??
    (await detectOutgoingSamlAuthnRequestForPostBinding(httpRequest))
  );
}

// Step 3 (HTTP Redirect Binding): UA ---(AuthnRequest)--> IdP
//
// Detected when:
// - It is a GET request
// - The URL query string contains SAMLRequest
async function detectOutgoingSamlAuthnRequestForRedirectBinding(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlAuthnRequest | undefined | Error> {
  if (httpRequest.method !== "GET") {
    return undefined;
  }

  const encodedSamlAuthnRequest = getQueryParameterValue(httpRequest.url, "SAMLRequest");
  if (encodedSamlAuthnRequest === undefined) {
    return undefined;
  } else if (encodedSamlAuthnRequest instanceof Error) {
    console.warn("Failed to get SAMLRequest value from url:", {
      url: httpRequest.url,
      error: encodedSamlAuthnRequest,
    });
    return undefined;
  }

  const samlAuthnRequestStr = await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const idp = getHostname(httpRequest.url);
  if (idp instanceof Error) {
    return idp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpRequest.imported,
    step: 3,
    type: "OutgoingAuthnRequest",
    idp,
    action: "User Agent redirects SAML AuthnRequest to Identity Provider",
    authnRequest: samlAuthnRequest,
  };
}

// Step 3 (HTTP POST Binding): UA ---(AuthnRequest)--> IdP
//
// Detected when:
// - It is a POST request
// - The POST parameters contain SAMLRequest
async function detectOutgoingSamlAuthnRequestForPostBinding(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlAuthnRequest | undefined | Error> {
  if (httpRequest.method !== "POST") {
    return undefined;
  }

  const requestBody = await getRequestBody(httpRequest);
  if (requestBody instanceof Error) {
    return requestBody;
  }

  const encodedSamlAuthnRequest = extractSamlRequestFromRequestBody(requestBody);
  if (encodedSamlAuthnRequest instanceof Error || encodedSamlAuthnRequest === undefined) {
    return encodedSamlAuthnRequest;
  }

  const samlAuthnRequestStr = decodeBase64(encodedSamlAuthnRequest);
  if (samlAuthnRequestStr instanceof Error) {
    return samlAuthnRequestStr;
  }

  const samlAuthnRequest = makeSamlAuthnRequest(samlAuthnRequestStr);
  if (samlAuthnRequest instanceof Error) {
    return samlAuthnRequest;
  }

  const idp = getHostname(httpRequest.url);
  if (idp instanceof Error) {
    return idp;
  }

  return {
    sessionId: samlAuthnRequest.id,
    createdAt: new Date().toISOString(),
    imported: httpRequest.imported,
    step: 3,
    type: "OutgoingAuthnRequest",
    idp,
    action: "User Agent submits SAML AuthnRequest to Identity Provider",
    authnRequest: samlAuthnRequest,
  };
}

function extractSamlRequestFromRequestBody(requestBody: string): string | undefined | Error {
  try {
    return new URLSearchParams(requestBody).get("SAMLRequest") ?? undefined;
  } catch (err) {
    return new Error("Failed to extract SAMLRequest from request body", { cause: err });
  }
}

// Step 4: UA <--(Response)--- IdP
async function detectIncomingSamlResponse(
  httpResponse: HttpResponse,
): Promise<IncomingSamlResponse | undefined | Error> {
  return (
    (await detectIncomingSamlResponseForRedirectBinding(httpResponse)) ??
    (await detectIncomingSamlResponseForPostBinding(httpResponse))
  );
}

// Step 4 (HTTP Redirect Binding): UA <--(Response)--- IdP
//
// Detected when:
// - It is a redirect response
// - The Location URL query string contains SAMLResponse
async function detectIncomingSamlResponseForRedirectBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlResponse | undefined | Error> {
  if (
    httpResponse.statusCode !== 302 &&
    httpResponse.statusCode !== 303 &&
    httpResponse.statusCode !== 307
  ) {
    return undefined;
  }

  const location = getHeaderValue(httpResponse, "Location");
  if (!location) {
    console.warn("No Location header:", { headers: httpResponse.headers });
    return undefined;
  }

  const encodedSamlResponse = getQueryParameterValue(location, "SAMLResponse");
  if (encodedSamlResponse === undefined) {
    return undefined;
  } else if (encodedSamlResponse instanceof Error) {
    console.warn("Failed to get SAMLResponse value from location:", {
      location,
      error: encodedSamlResponse,
    });
    return undefined;
  }

  const samlResponseStr = await decodeSamlRedirectBindingMessage(encodedSamlResponse);
  if (samlResponseStr instanceof Error) {
    return samlResponseStr;
  }

  const samlResponse = makeSamlResponse(samlResponseStr);
  if (samlResponse instanceof Error) {
    return samlResponse;
  }

  const idp = getHostname(httpResponse.url);
  if (idp instanceof Error) {
    return idp;
  }

  return {
    sessionId: samlResponse.inResponseTo,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 4,
    type: "IncomingResponse",
    date: getResponseDate(httpResponse),
    idp,
    action: "Identity Provider issues SAML Response",
    response: samlResponse,
  };
}

// Step 4 (HTTP POST Binding): UA <--(Response)--- IdP
//
// Detected when:
// - The response body is HTML
// - A form in that HTML has a parameter named SAMLResponse
async function detectIncomingSamlResponseForPostBinding(
  httpResponse: HttpResponse,
): Promise<IncomingSamlResponse | undefined | Error> {
  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const responseBody = await getResponseBody(httpResponse);
  if (responseBody instanceof Error) {
    return responseBody;
  }

  const encodedSamlResponse = extractSamlResponseFromResponseBody(responseBody);
  if (!encodedSamlResponse) {
    return undefined;
  }

  const samlResponseStr = decodeBase64(encodedSamlResponse);
  if (samlResponseStr instanceof Error) {
    return samlResponseStr;
  }

  const samlResponse = makeSamlResponse(samlResponseStr);
  if (samlResponse instanceof Error) {
    return samlResponse;
  }

  const idp = getHostname(httpResponse.url);
  if (idp instanceof Error) {
    return idp;
  }

  return {
    sessionId: samlResponse.inResponseTo,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 4,
    type: "IncomingResponse",
    date: getResponseDate(httpResponse),
    idp,
    action: "Identity Provider issues SAML Response",
    response: samlResponse,
  };
}

function extractSamlResponseFromResponseBody(responseBody: string): string | undefined {
  return (
    responseBody.match(/name="SAMLResponse"\s+value="([^"]+)"/i)?.[1] ||
    responseBody.match(/value="([^"]+)"\s+name="SAMLResponse"/i)?.[1]
  );
}

// Step 5: UA ---(Response)--> SP
async function detectOutgoingSamlResponse(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlResponse | undefined | Error> {
  return (
    (await detectOutgoingSamlResponseForRedirectBinding(httpRequest)) ??
    (await detectOutgoingSamlResponseForPostBinding(httpRequest))
  );
}

// Step 5 (HTTP Redirect Binding): UA ---(Response)--> SP
//
// Detected when:
// - It is a GET request
// - The URL query string contains SAMLResponse
async function detectOutgoingSamlResponseForRedirectBinding(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlResponse | undefined | Error> {
  if (httpRequest.method !== "GET") {
    return undefined;
  }

  const encodedSamlResponse = getQueryParameterValue(httpRequest.url, "SAMLResponse");
  if (encodedSamlResponse === undefined) {
    return undefined;
  } else if (encodedSamlResponse instanceof Error) {
    console.warn("Failed to get SAMLResponse value from url:", {
      url: httpRequest.url,
      error: encodedSamlResponse,
    });
    return undefined;
  }

  const samlResponseStr = await decodeSamlRedirectBindingMessage(encodedSamlResponse);
  if (samlResponseStr instanceof Error) {
    return samlResponseStr;
  }

  const samlResponse = makeSamlResponse(samlResponseStr);
  if (samlResponse instanceof Error) {
    return samlResponse;
  }

  const sp = getHostname(httpRequest.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlResponse.inResponseTo,
    createdAt: new Date().toISOString(),
    imported: httpRequest.imported,
    step: 5,
    type: "OutgoingResponse",
    sp,
    action: "User Agent redirects SAML Response to Service Provider",
    response: samlResponse,
  };
}

// Step 5 (HTTP POST Binding): UA ---(Response)--> SP
//
// Detected when:
// - It is a POST request
// - The POST parameters contain SAMLResponse
async function detectOutgoingSamlResponseForPostBinding(
  httpRequest: HttpRequest,
): Promise<OutgoingSamlResponse | undefined | Error> {
  if (httpRequest.method !== "POST") {
    return undefined;
  }

  const requestBody = await getRequestBody(httpRequest);
  if (requestBody instanceof Error) {
    return requestBody;
  }

  const encodedSamlResponse = extractSamlResponseFromRequestBody(requestBody);
  if (encodedSamlResponse instanceof Error || encodedSamlResponse === undefined) {
    return encodedSamlResponse;
  }

  const samlResponseStr = decodeBase64(encodedSamlResponse);
  if (samlResponseStr instanceof Error) {
    return samlResponseStr;
  }

  const samlResponse = makeSamlResponse(samlResponseStr);
  if (samlResponse instanceof Error) {
    return samlResponse;
  }

  const sp = getHostname(httpRequest.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlResponse.inResponseTo,
    createdAt: new Date().toISOString(),
    imported: httpRequest.imported,
    step: 5,
    type: "OutgoingResponse",
    sp,
    action: "User Agent submits SAML Response to Service Provider",
    response: samlResponse,
  };
}

function extractSamlResponseFromRequestBody(requestBody: string): string | undefined | Error {
  try {
    return new URLSearchParams(requestBody).get("SAMLResponse") ?? undefined;
  } catch (err) {
    return new Error("Failed to extract SAMLResponse from request body", { cause: err });
  }
}

// Step 6: UA <--(result)--- SP
//
// Detected when:
// - It is the response to Step 5
async function detectAuthenticatedResourceResponse(
  httpResponse: HttpResponse,
): Promise<AuthenticatedResourceResponse | undefined | Error> {
  const samlOutgoingResponse = await detectOutgoingSamlResponse(httpResponse.request);
  if (samlOutgoingResponse instanceof Error || samlOutgoingResponse === undefined) {
    return samlOutgoingResponse;
  }

  const sp = getHostname(httpResponse.url);
  if (sp instanceof Error) {
    return sp;
  }

  return {
    sessionId: samlOutgoingResponse.sessionId,
    createdAt: new Date().toISOString(),
    imported: httpResponse.imported,
    step: 6,
    type: "AuthenticatedResourceResponse",
    date: getResponseDate(httpResponse),
    sp,
    action: "Service Provider returns the requested resource",
    result: "not implemented",
  };
}

function getResponseDate(httpResponse: HttpResponse): string | undefined {
  const dateStr = getHeaderValue(httpResponse, "Date");
  if (!dateStr) {
    console.info("No Date header:", { headers: httpResponse.headers, url: httpResponse.url });
    return undefined;
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.info("Invalid Date header:", { headers: httpResponse.headers, url: httpResponse.url });
    return undefined;
  }

  return date.toISOString();
}

function getQueryParameterValue(url: string, key: string): string | undefined | Error {
  try {
    return new URL(url, "http://example.com/").searchParams.get(key) ?? undefined;
  } catch (err) {
    return new Error("Failed to parse url query string", { cause: err });
  }
}

function getHostname(url: string): string | Error {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return new Error("Failed to extract hostname from url", { cause: err });
  }
}

function makeSamlAuthnRequest(samlAuthnRequestStr: string): SamlAuthnRequest | Error {
  const parsed = parseSamlpAuthnRequest(samlAuthnRequestStr);
  if (parsed instanceof Error) {
    return parsed;
  }

  const id = unwrap(parsed.$id);
  if (!id) {
    return new Error("ID not found in AuthnRequest");
  }

  return { id, raw: samlAuthnRequestStr };
}

function makeSamlResponse(samlResponseStr: string): SamlResponse | Error {
  const parsed = parseSamlpResponse(samlResponseStr);
  if (parsed instanceof Error) {
    return parsed;
  }

  const inResponseTo = unwrap(parsed.$inResponseTo);
  if (!inResponseTo) {
    return new Error("InResponseTo not found in Response");
  }

  const statusCode = unwrap(unwrap(unwrap(parsed.status)?.statusCode)?.$value);
  if (!statusCode) {
    return new Error("StatusCode not found in Response");
  }

  return {
    inResponseTo,
    statusCode,
    raw: samlResponseStr,
  };
}

function decodeBase64(b64: string): string | Error {
  try {
    return Base64.decode(b64);
  } catch (err) {
    return new Error("Failed to decode Base64 string", { cause: err });
  }
}

async function decodeSamlRedirectBindingMessage(b64: string): Promise<string | Error> {
  try {
    const stream = new Blob([Base64.toUint8Array(b64) as Uint8Array<ArrayBuffer>]) // Fixed for TypeScript 5.9
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const blob = await new Response(stream).blob();
    return await blob.text();
  } catch (err) {
    return new Error("Failed to decode SAML HTTP Redirect Binding message", { cause: err });
  }
}

// Convert Error to undefined for easier handling
function unwrap<T>(value: T | Error | undefined): T | undefined {
  if (value === undefined || value instanceof Error) {
    return undefined;
  }
  return value;
}
