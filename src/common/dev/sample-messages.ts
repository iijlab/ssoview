/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { type HttpMessage } from "@/common/models/http-message.ts";
import sampleAuthnRequestXmlRaw from "./authn-request.xml?raw";
import samlSuccessResponseXmlRaw from "./response-success.xml?raw";
import samlFailureResponseXmlRaw from "./response-failure.xml?raw";
import samlUnknownResponseXmlRaw from "./response-unknown.xml?raw";

//
// Sample SAML XML
//

const sampleAuthnRequestXml = sampleAuthnRequestXmlRaw.trim();
const samlSuccessResponseXml = samlSuccessResponseXmlRaw.trim();
const samlFailureResponseXml = samlFailureResponseXmlRaw.trim();
const samlUnknownResponseXml = samlUnknownResponseXmlRaw.trim();

export async function buildSampleHttpMessages(): Promise<HttpMessage[]> {
  const sample = new URLSearchParams(window.location.search).get("sample");
  const samlResponseXml =
    sample === "failure"
      ? samlFailureResponseXml
      : sample === "unknown"
        ? samlUnknownResponseXml
        : samlSuccessResponseXml;
  const encodedAuthnRequest = await deflateAndBase64Encode(sampleAuthnRequestXml);
  const encodedSamlResponse = base64Encode(samlResponseXml);

  const idpSsoUrl = `https://idp.example.org/SAML2/SSO/Redirect?SAMLRequest=${encodeURIComponent(encodedAuthnRequest)}`;

  const httpMessageBase = {
    imported: false,
    bodyStatus: "loaded" as const,
    resourceType: "Document" as const,
  };

  // Step 1: User -> SP
  const httpRequest1 = {
    ...httpMessageBase,
    stage: "Request" as const,
    createdAt: "2004-12-05T09:21:58.000Z",
    requestId: "req-001",
    url: "https://sp.example.com/SAML2/resource",
    method: "GET",
    headers: [{ name: "Host", value: "sp.example.com" }],
    body: "",
  } satisfies HttpMessage;

  // Step 2: SP -> User
  const httpResponse2 = {
    ...httpMessageBase,
    stage: "Response" as const,
    createdAt: "2004-12-05T09:21:59.000Z",
    requestId: "req-001",
    url: "https://sp.example.com/SAML2/resource",
    method: "GET",
    statusCode: 302,
    headers: [
      { name: "Content-Type", value: "text/html; charset=utf-8" },
      { name: "Date", value: "Sun, 05 Dec 2004 09:21:59 GMT" },
      { name: "Location", value: idpSsoUrl },
    ],
    body: "",
    request: httpRequest1,
  } satisfies HttpMessage;

  // Step 3: User -> IdP
  const httpRequest3 = {
    ...httpMessageBase,
    stage: "Request" as const,
    createdAt: "2004-12-05T09:21:59.200Z",
    requestId: "req-002",
    url: idpSsoUrl,
    method: "GET",
    headers: [{ name: "Host", value: "idp.example.org" }],
    body: "",
  } satisfies HttpMessage;

  // Step 4: IdP -> User
  const httpResponse4 = {
    ...httpMessageBase,
    stage: "Response" as const,
    createdAt: "2004-12-05T09:22:05.000Z",
    requestId: "req-002",
    url: idpSsoUrl,
    method: "GET",
    statusCode: 200,
    headers: [
      { name: "Content-Type", value: "text/html; charset=utf-8" },
      { name: "Date", value: "Sun, 05 Dec 2004 09:22:05 GMT" },
    ],
    body: `<!DOCTYPE html>
<html>
  <head><title>SAML Response</title></head>
  <body>
    <form method="POST" action="https://sp.example.com/SAML2/SSO/POST">
      <input type="hidden" name="SAMLResponse" value="${encodedSamlResponse}" />
      <input type="hidden" name="RelayState" value="ss:mem:6f7a8e9b3c4d5e6f" />
      <noscript><button type="submit">Continue</button></noscript>
    </form>
    <script>document.forms[0].submit();</script>
  </body>
</html>`,
    request: httpRequest3,
  } satisfies HttpMessage;

  // Step 5: User -> SP
  const httpRequest5 = {
    ...httpMessageBase,
    stage: "Request" as const,
    createdAt: "2004-12-05T09:22:05.100Z",
    requestId: "req-003",
    url: "https://sp.example.com/SAML2/SSO/POST",
    method: "POST",
    headers: [
      { name: "Host", value: "sp.example.com" },
      { name: "Content-Type", value: "application/x-www-form-urlencoded" },
    ],
    body: `SAMLResponse=${encodeURIComponent(encodedSamlResponse)}&RelayState=${encodeURIComponent("ss:mem:6f7a8e9b3c4d5e6f")}`,
  } satisfies HttpMessage;

  // Step 6:  SP -> User
  const isSuccess = sample !== "failure" && sample !== "unknown";
  const httpResponse6 = {
    ...httpMessageBase,
    stage: "Response" as const,
    createdAt: "2004-12-05T09:22:05.500Z",
    requestId: "req-003",
    url: "https://sp.example.com/SAML2/SSO/POST",
    method: "POST",
    statusCode: isSuccess ? 200 : 403,
    headers: [
      { name: "Content-Type", value: "text/html; charset=utf-8" },
      { name: "Date", value: "Sun, 05 Dec 2004 09:22:05 GMT" },
    ],
    body: isSuccess
      ? `<!DOCTYPE html>
<html>
  <head><title>My page</title></head>
  <body><p>Login successful</p></body>
</html>`
      : `<!DOCTYPE html>
<html>
  <head><title>Error</title></head>
  <body><p>Authentication failed</p></body>
</html>`,
    request: httpRequest5,
  } satisfies HttpMessage;

  const allMessages = [
    httpRequest1,
    httpResponse2,
    httpRequest3,
    httpResponse4,
    httpRequest5,
    httpResponse6,
  ];

  const stepMatch = sample?.match(/^step([2-6])$/);
  if (stepMatch) {
    return allMessages.slice(0, Number(stepMatch[1]));
  }

  // Remove specific steps to simulate missing data (e.g., ?sample=missing-3,4)
  const missingMatch = sample?.match(/^missing-([\d,]+)$/);
  if (missingMatch) {
    const missingSteps = new Set(missingMatch[1]!.split(",").map(Number));
    return allMessages.filter((_, i) => !missingSteps.has(i + 1));
  }

  return allMessages;
}

//
// Helpers
//

async function deflateAndBase64Encode(xml: string): Promise<string> {
  const stream = new Blob([xml]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = await new Response(stream).arrayBuffer();
  return Base64.fromUint8Array(new Uint8Array(compressed));
}

function base64Encode(xml: string): string {
  return Base64.encode(xml);
}
