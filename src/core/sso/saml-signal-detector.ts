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
} from "@/core/http/http-message.ts";
import {
  type SamlSignalFromHttpRequest,
  type SamlSignalFromHttpResponse,
} from "@/core/sso/saml-signal.ts";
import { parseSamlpAuthnRequestXml, parseSamlpResponseXml } from "./saml-xml-parser.ts";

export async function detectSamlSignalFromHttpRequest(
  httpRequest: HttpRequest,
): Promise<SamlSignalFromHttpRequest | undefined | Error> {
  return (
    (await detectUnauthenticatedResourceRequest(httpRequest)) ??
    (await detectOutgoingSamlAuthnRequest(httpRequest)) ??
    (await detectOutgoingSamlResponse(httpRequest))
  );
}

export async function detectSamlSignalFromHttpResponse(
  httpResponse: HttpResponse,
  pairedHttpRequest: HttpRequest,
): Promise<SamlSignalFromHttpResponse | undefined | Error> {
  return (
    (await detectIncomingSamlAuthnRequest(httpResponse)) ??
    (await detectIncomingSamlResponse(httpResponse)) ??
    (await detectAuthenticatedResourceResponse(pairedHttpRequest))
  );
}

export async function extractSamlpAuthnRequestXml(
  httpMessage: HttpMessage,
): Promise<string | undefined | Error> {
  return httpMessage.type === "Request"
    ? await extractSamlpAuthnRequestXmlFromHttpRequest(httpMessage)
    : await extractSamlpAuthnRequestXmlFromHttpResponse(httpMessage);
}

export async function extractSamlpResponseXml(
  httpMessage: HttpMessage,
): Promise<string | undefined | Error> {
  return httpMessage.type === "Request"
    ? await extractSamlpResponseXmlFromHttpRequest(httpMessage)
    : await extractSamlpResponseXmlFromHttpResponse(httpMessage);
}

// [1] UA ---(resource request)--> SP
//
// A resource request has no SAML marker, so it cannot be detected from the
// request alone. Whether it is SAML-related is determined by whether the
// response contains an AuthnRequest.
async function detectUnauthenticatedResourceRequest(_: HttpRequest): Promise<undefined> {
  return undefined;
}

// [2] UA <--(AuthnRequest)--- SP
async function detectIncomingSamlAuthnRequest(
  httpResponse: HttpResponse,
): Promise<
  (SamlSignalFromHttpResponse & { type: "IncomingSamlAuthnRequest" }) | undefined | Error
> {
  const authnRequestXml = await extractSamlpAuthnRequestXmlFromHttpResponse(httpResponse);
  if (authnRequestXml === undefined || authnRequestXml instanceof Error) {
    return authnRequestXml;
  }

  const correlationKey = extractCorrelationKeyFromSamlAuthnRequest(authnRequestXml);
  if (correlationKey instanceof Error) {
    return correlationKey;
  }

  return {
    type: "IncomingSamlAuthnRequest",
    correlationKey,
  };
}

async function extractSamlpAuthnRequestXmlFromHttpResponse(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  return (
    (await extractSamlpAuthnRequestXmlFromHttpResponseForHttpRedirect(httpResponse)) ??
    (await extractSamlpAuthnRequestXmlFromHttpResponseForHttpPost(httpResponse)) ??
    (await extractSamlpAuthnRequestXmlFromHttpResponseForScriptRedirect(httpResponse)) ??
    (await extractSamlpAuthnRequestXmlFromHttpResponseForMetaRefresh(httpResponse))
  );
}

// [2] (HTTP Redirect Binding): UA <--(AuthnRequest)--- SP
//
// Detected when:
// - It is a redirect response
// - The Location URL query string contains SAMLRequest
async function extractSamlpAuthnRequestXmlFromHttpResponseForHttpRedirect(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
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

  return await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
}

// [2] (HTTP POST Binding):  UA <--(AuthnRequest)--- SP
//
// Detected when:
// - The response body is HTML
// - A form in that HTML has a parameter named SAMLRequest
async function extractSamlpAuthnRequestXmlFromHttpResponseForHttpPost(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  if (httpResponse.body === undefined) {
    return undefined;
  }

  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const encodedSamlAuthnRequest = extractSamlRequestFromResponseBody(httpResponse.body);
  if (!encodedSamlAuthnRequest) {
    return undefined;
  }

  return decodeBase64(encodedSamlAuthnRequest);
}

function extractSamlRequestFromResponseBody(responseBody: string): string | undefined {
  return (
    responseBody.match(/name="SAMLRequest"\s+value="([^"]+)"/i)?.[1] ||
    responseBody.match(/value="([^"]+)"\s+name="SAMLRequest"/i)?.[1]
  );
}

// [2] (Script Redirect Binding): UA <--(AuthnRequest)--- SP
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
async function extractSamlpAuthnRequestXmlFromHttpResponseForScriptRedirect(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  if (httpResponse.body === undefined) {
    return undefined;
  }

  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const matched = httpResponse.body.match(/"location\.href=&quot;([^"]*SAMLRequest=[^"]*)&quot;"/);
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

  return await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
}

// [2] (Meta Refresh Binding): UA <--(AuthnRequest)--- SP
//
// A non-standard method used by some sites that navigates via <meta http-equiv="refresh">.
// The SAMLRequest is encoded the same way as in the HTTP Redirect Binding.
//
// Detected when:
// - The response body is HTML
// - A URL is specified via <meta http-equiv="refresh"> in that HTML
// - The query string of that URL contains SAMLRequest
async function extractSamlpAuthnRequestXmlFromHttpResponseForMetaRefresh(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  if (httpResponse.body === undefined) {
    return undefined;
  }

  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const url = extractUrlFromMetaRefresh(httpResponse.body);
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

  return await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
}

function extractUrlFromMetaRefresh(responseBody: string): string | undefined {
  const matched = responseBody.match(
    /<meta\s+http-equiv=\\?"refresh\\?"\s+content=\\?"[^;]*;\s*url=([^"\\]+)/i,
  );
  return matched?.[1];
}

// [3] UA ---(AuthnRequest)--> IdP
async function detectOutgoingSamlAuthnRequest(
  httpRequest: HttpRequest,
): Promise<(SamlSignalFromHttpRequest & { type: "OutgoingSamlAuthnRequest" }) | undefined | Error> {
  const authnRequestXml = await extractSamlpAuthnRequestXmlFromHttpRequest(httpRequest);
  if (authnRequestXml === undefined || authnRequestXml instanceof Error) {
    return authnRequestXml;
  }

  const correlationKey = extractCorrelationKeyFromSamlAuthnRequest(authnRequestXml);
  if (correlationKey instanceof Error) {
    return correlationKey;
  }

  return {
    type: "OutgoingSamlAuthnRequest",
    correlationKey,
  };
}

async function extractSamlpAuthnRequestXmlFromHttpRequest(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  return (
    (await extractSamlpAuthnRequestXmlFromHttpRequestForHttpRedirect(httpRequest)) ??
    (await extractSamlpAuthnRequestXmlFromHttpRequestForHttpPost(httpRequest))
  );
}

// [3] (HTTP Redirect Binding): UA ---(AuthnRequest)--> IdP
//
// Detected when:
// - It is a GET request
// - The URL query string contains SAMLRequest
async function extractSamlpAuthnRequestXmlFromHttpRequestForHttpRedirect(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
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

  return await decodeSamlRedirectBindingMessage(encodedSamlAuthnRequest);
}

// [3] (HTTP POST Binding): UA ---(AuthnRequest)--> IdP
//
// Detected when:
// - It is a POST request
// - The POST parameters contain SAMLRequest
async function extractSamlpAuthnRequestXmlFromHttpRequestForHttpPost(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  if (httpRequest.body === undefined) {
    return undefined;
  }

  if (httpRequest.method !== "POST") {
    return undefined;
  }

  const encodedSamlAuthnRequest = extractSamlRequestFromRequestBody(httpRequest.body);
  if (encodedSamlAuthnRequest instanceof Error || encodedSamlAuthnRequest === undefined) {
    return encodedSamlAuthnRequest;
  }

  return decodeBase64(encodedSamlAuthnRequest);
}

function extractSamlRequestFromRequestBody(requestBody: string): string | undefined | Error {
  try {
    return new URLSearchParams(requestBody).get("SAMLRequest") ?? undefined;
  } catch (err) {
    return new Error("Failed to extract SAMLRequest from request body", { cause: err });
  }
}

// [4] UA <--(Response)--- IdP
async function detectIncomingSamlResponse(
  httpResponse: HttpResponse,
): Promise<(SamlSignalFromHttpResponse & { type: "IncomingSamlResponse" }) | undefined | Error> {
  const responseXml = await extractSamlpResponseXmlFromHttpResponse(httpResponse);
  if (responseXml === undefined || responseXml instanceof Error) {
    return responseXml;
  }

  const correlationKey = extractCorrelationKeyFromSamlResponse(responseXml);
  if (correlationKey instanceof Error) {
    return correlationKey;
  }

  const samlStatusCode = extractStatusCodeFromSamlResponse(responseXml);
  if (samlStatusCode instanceof Error) {
    return samlStatusCode;
  }

  return {
    type: "IncomingSamlResponse",
    correlationKey,
    samlStatusCode,
  };
}

async function extractSamlpResponseXmlFromHttpResponse(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  return (
    (await extractSamlpResponseXmlFromHttpResponseForHttpRedirect(httpResponse)) ??
    (await extractSamlpResponseXmlFromHttpResponseForHttpPost(httpResponse))
  );
}

// [4] (HTTP Redirect Binding): UA <--(Response)--- IdP
//
// Detected when:
// - It is a redirect response
// - The Location URL query string contains SAMLResponse
async function extractSamlpResponseXmlFromHttpResponseForHttpRedirect(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
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

  return await decodeSamlRedirectBindingMessage(encodedSamlResponse);
}

// [4] (HTTP POST Binding): UA <--(Response)--- IdP
//
// Detected when:
// - The response body is HTML
// - A form in that HTML has a parameter named SAMLResponse
async function extractSamlpResponseXmlFromHttpResponseForHttpPost(
  httpResponse: HttpResponse,
): Promise<string | undefined | Error> {
  if (httpResponse.body === undefined) {
    return undefined;
  }

  const contentType = getHeaderValue(httpResponse, "Content-Type");
  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const encodedSamlResponse = extractSamlResponseFromResponseBody(httpResponse.body);
  if (!encodedSamlResponse) {
    return undefined;
  }

  return decodeBase64(encodedSamlResponse);
}

function extractSamlResponseFromResponseBody(responseBody: string): string | undefined {
  return (
    responseBody.match(/name="SAMLResponse"\s+value="([^"]+)"/i)?.[1] ||
    responseBody.match(/value="([^"]+)"\s+name="SAMLResponse"/i)?.[1]
  );
}

// [5] UA ---(Response)--> SP
async function detectOutgoingSamlResponse(
  httpRequest: HttpRequest,
): Promise<(SamlSignalFromHttpRequest & { type: "OutgoingSamlResponse" }) | undefined | Error> {
  const responseXml = await extractSamlpResponseXmlFromHttpRequest(httpRequest);
  if (responseXml === undefined || responseXml instanceof Error) {
    return responseXml;
  }

  const correlationKey = extractCorrelationKeyFromSamlResponse(responseXml);
  if (correlationKey instanceof Error) {
    return correlationKey;
  }

  const samlStatusCode = extractStatusCodeFromSamlResponse(responseXml);
  if (samlStatusCode instanceof Error) {
    return samlStatusCode;
  }

  return {
    type: "OutgoingSamlResponse",
    correlationKey,
    samlStatusCode,
  };
}

async function extractSamlpResponseXmlFromHttpRequest(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  return (
    (await extractSamlpResponseXmlFromHttpRequestForHttpRedirect(httpRequest)) ??
    (await extractSamlpResponseXmlFromHttpRequestForHttpPost(httpRequest))
  );
}

// [5] (HTTP Redirect Binding): UA ---(Response)--> SP
//
// Detected when:
// - It is a GET request
// - The URL query string contains SAMLResponse
async function extractSamlpResponseXmlFromHttpRequestForHttpRedirect(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
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

  return await decodeSamlRedirectBindingMessage(encodedSamlResponse);
}

// [5] (HTTP POST Binding): UA ---(Response)--> SP
//
// Detected when:
// - It is a POST request
// - The POST parameters contain SAMLResponse
async function extractSamlpResponseXmlFromHttpRequestForHttpPost(
  httpRequest: HttpRequest,
): Promise<string | undefined | Error> {
  if (httpRequest.body === undefined) {
    return undefined;
  }

  if (httpRequest.method !== "POST") {
    return undefined;
  }

  const encodedSamlResponse = extractSamlResponseFromRequestBody(httpRequest.body);
  if (encodedSamlResponse instanceof Error || encodedSamlResponse === undefined) {
    return encodedSamlResponse;
  }

  return decodeBase64(encodedSamlResponse);
}

function extractSamlResponseFromRequestBody(requestBody: string): string | undefined | Error {
  try {
    return new URLSearchParams(requestBody).get("SAMLResponse") ?? undefined;
  } catch (err) {
    return new Error("Failed to extract SAMLResponse from request body", { cause: err });
  }
}

// [6] UA <--(result)--- SP
//
// Detected when:
// - It is the response to [5]
async function detectAuthenticatedResourceResponse(
  pairedHttpRequest: HttpRequest,
): Promise<
  (SamlSignalFromHttpResponse & { type: "AuthenticatedResourceResponse" }) | undefined | Error
> {
  const samlOutgoingResponse = await detectOutgoingSamlResponse(pairedHttpRequest);
  if (samlOutgoingResponse instanceof Error || samlOutgoingResponse === undefined) {
    return samlOutgoingResponse;
  }

  return {
    type: "AuthenticatedResourceResponse",
    correlationKey: samlOutgoingResponse.correlationKey,
  };
}

function getQueryParameterValue(url: string, key: string): string | undefined | Error {
  try {
    return new URL(url, "http://example.com/").searchParams.get(key) ?? undefined;
  } catch (err) {
    return new Error("Failed to parse url query string", { cause: err });
  }
}

function extractCorrelationKeyFromSamlAuthnRequest(samlAuthnRequestStr: string): string | Error {
  const parsed = parseSamlpAuthnRequestXml(samlAuthnRequestStr);
  if (parsed instanceof Error) {
    return parsed;
  }

  const id = unwrap(parsed.$id);
  if (!id) {
    return new Error("ID not found in AuthnRequest");
  }

  return id;
}

function extractCorrelationKeyFromSamlResponse(samlResponseStr: string): string | Error {
  const parsed = parseSamlpResponseXml(samlResponseStr);
  if (parsed instanceof Error) {
    return parsed;
  }

  const id = unwrap(parsed.$id);
  if (!id) {
    return new Error("ID not found in Response");
  }

  const inResponseTo = unwrap(parsed.$inResponseTo);

  return inResponseTo ?? id;
}

function extractStatusCodeFromSamlResponse(samlResponseStr: string): string | Error {
  const parsed = parseSamlpResponseXml(samlResponseStr);
  if (parsed instanceof Error) {
    return parsed;
  }

  const statusCode = unwrap(unwrap(unwrap(parsed.status)?.statusCode)?.$value);
  if (!statusCode) {
    return new Error("StatusCode not found in Response");
  }

  return statusCode;
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
