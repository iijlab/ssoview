/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { type TracingSession } from "@/common/models/capture-session.ts";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpMessage, type HttpRequest } from "@/common/models/http-message.ts";
import { type SamlSignal } from "@/common/models/saml-detection.ts";
import { type SamlLog, newSamlLog } from "@/common/models/saml-trace.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { type FlowData } from "@/report-page/common/types.ts";
import sampleAuthnRequestXmlRaw from "./authn-request.xml?raw";
import samlFailureResponseXmlRaw from "./response-failure.xml?raw";
import samlSuccessResponseXmlRaw from "./response-success.xml?raw";
import samlUnknownResponseXmlRaw from "./response-unknown.xml?raw";

//
// Sample SAML XML
//

const sampleAuthnRequestXml = sampleAuthnRequestXmlRaw.trim();
const samlSuccessResponseXml = samlSuccessResponseXmlRaw.trim();
const samlFailureResponseXml = samlFailureResponseXmlRaw.trim();
const samlUnknownResponseXml = samlUnknownResponseXmlRaw.trim();

const sampleSsoTraceId = "trace-sample";
const sampleTracingSessionId = "cs-sample";

export async function buildSampleFlowData(): Promise<FlowData> {
  const sample = new URLSearchParams(window.location.search).get("sample");

  const allHttpMessages = await buildSampleHttpMessages(sample);
  const { samlLogs: allSamlLogs, correlationKey } = await buildSampleSamlLogs(allHttpMessages);

  const httpMessages = selectSampleHttpMessages(sample, allHttpMessages);
  const httpMessageIds = new Set(httpMessages.map((m) => m.id));
  const samlLogs = allSamlLogs.filter((l) => httpMessageIds.has(l.httpMessageId));

  const ssoTrace: SsoTrace = {
    id: sampleSsoTraceId,
    tracingSessionId: sampleTracingSessionId,
    protocol: "saml",
    correlationKey,
  };

  const tracingSession: TracingSession = {
    id: sampleTracingSessionId,
    imported: false,
    startedAt: "2004-12-05T09:21:57.000Z",
    endedAt: "2004-12-05T09:22:06.000Z",
  };

  return { ssoTrace, tracingSession, samlLogs, httpMessages };
}

async function buildSampleHttpMessages(sample: string | null): Promise<HttpMessage[]> {
  const samlResponseXml =
    sample === "failure"
      ? samlFailureResponseXml
      : sample === "unknown"
        ? samlUnknownResponseXml
        : samlSuccessResponseXml;
  const encodedAuthnRequest = await deflateAndBase64Encode(sampleAuthnRequestXml);
  const encodedSamlResponse = base64Encode(samlResponseXml);

  const idpSsoUrl = `https://idp.example.org/SAML2/SSO/Redirect?SAMLRequest=${encodeURIComponent(encodedAuthnRequest)}`;

  // Step 1: User -> SP
  const httpRequest1 = {
    id: "msg-001",
    type: "Request" as const,
    observedAt: "2004-12-05T09:21:58.000Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-001",
    url: "https://sp.example.com/SAML2/resource",
    method: "GET",
    headers: [{ name: "Host", value: "sp.example.com" }],
    body: "",
  } satisfies HttpMessage;

  // Step 2: SP -> User
  const httpResponse2 = {
    id: "msg-002",
    type: "Response" as const,
    observedAt: "2004-12-05T09:21:59.000Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-001",
    url: "https://sp.example.com/SAML2/resource",
    method: "GET",
    statusCode: 302,
    headers: [
      { name: "Content-Type", value: "text/html; charset=utf-8" },
      { name: "Date", value: "Sun, 05 Dec 2004 09:21:59 GMT" },
      { name: "Location", value: idpSsoUrl },
    ],
    body: undefined,
    pairedHttpRequestId: httpRequest1.id,
  } satisfies HttpMessage;

  // Step 3: User -> IdP
  const httpRequest3 = {
    id: "msg-003",
    type: "Request" as const,
    observedAt: "2004-12-05T09:21:59.200Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-002",
    url: idpSsoUrl,
    method: "GET",
    headers: [{ name: "Host", value: "idp.example.org" }],
    body: "",
  } satisfies HttpMessage;

  // Step 4: IdP -> User
  const httpResponse4 = {
    id: "msg-004",
    type: "Response" as const,
    observedAt: "2004-12-05T09:22:05.000Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-002",
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
    pairedHttpRequestId: httpRequest3.id,
  } satisfies HttpMessage;

  // Step 5: User -> SP
  const httpRequest5 = {
    id: "msg-005",
    type: "Request" as const,
    observedAt: "2004-12-05T09:22:05.100Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-003",
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
    id: "msg-006",
    type: "Response" as const,
    observedAt: "2004-12-05T09:22:05.500Z",
    tracingSessionId: sampleTracingSessionId,
    tabId: 1,
    fetchRequestId: "req-003",
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
    pairedHttpRequestId: httpRequest5.id,
  } satisfies HttpMessage;

  return [httpRequest1, httpResponse2, httpRequest3, httpResponse4, httpRequest5, httpResponse6];
}

function selectSampleHttpMessages(
  sample: string | null,
  allHttpMessages: HttpMessage[],
): HttpMessage[] {
  const stepMatch = sample?.match(/^step([2-6])$/);
  if (stepMatch) {
    return allHttpMessages.slice(0, Number(stepMatch[1]));
  }

  // Remove specific steps to simulate missing data (e.g., ?sample=missing-3,4)
  const missingMatch = sample?.match(/^missing-([\d,]+)$/);
  if (missingMatch) {
    const missingSteps = new Set(missingMatch[1]!.split(",").map(Number));
    return allHttpMessages.filter((_, i) => !missingSteps.has(i + 1));
  }

  return allHttpMessages;
}

async function buildSampleSamlLogs(
  httpMessages: HttpMessage[],
): Promise<{ samlLogs: SamlLog[]; correlationKey: string }> {
  const samlSignals = await detectSampleSamlSignals(httpMessages);
  const correlationKey = samlSignals[0]?.samlSignal.correlationKey ?? "";

  const samlLogs: SamlLog[] = [];
  for (const { samlSignal, httpMessage, pairedHttpRequest } of samlSignals) {
    if (samlSignal.step === 2 && pairedHttpRequest !== undefined) {
      pushSamlLog(
        samlLogs,
        { step: 1, correlationKey: samlSignal.correlationKey },
        pairedHttpRequest,
      );
    }
    pushSamlLog(samlLogs, samlSignal, httpMessage);
  }

  return { samlLogs, correlationKey };
}

type SampleSamlSignal = {
  samlSignal: SamlSignal;
  httpMessage: HttpMessage;
  pairedHttpRequest?: HttpRequest;
};

async function detectSampleSamlSignals(httpMessages: HttpMessage[]): Promise<SampleSamlSignal[]> {
  const samlSignals: SampleSamlSignal[] = [];

  for (const httpMessage of httpMessages) {
    const pairedHttpRequest =
      httpMessage.type === "Response"
        ? findPairedHttpRequest(httpMessage.pairedHttpRequestId, httpMessages)
        : undefined;

    const samlSignal = await detectSamlSignal(httpMessage, pairedHttpRequest);
    if (samlSignal instanceof Error) {
      console.error("Failed to detect SAML signal from sample message:", samlSignal);
      continue;
    } else if (!samlSignal) {
      continue;
    }

    samlSignals.push({ samlSignal, httpMessage, pairedHttpRequest });
  }

  return samlSignals;
}

async function detectSamlSignal(
  httpMessage: HttpMessage,
  pairedHttpRequest: HttpRequest | undefined,
): Promise<SamlSignal | undefined | Error> {
  if (httpMessage.type === "Request") {
    return detectSamlSignalFromHttpRequest(httpMessage);
  } else if (pairedHttpRequest === undefined) {
    return new Error(`No paired HTTP request for HTTP response: ${httpMessage.id}`);
  } else {
    return detectSamlSignalFromHttpResponse(httpMessage, pairedHttpRequest);
  }
}

function findPairedHttpRequest(
  pairedHttpRequestId: string,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === pairedHttpRequestId);
  return pairedHttpRequest?.type === "Request" ? pairedHttpRequest : undefined;
}

function pushSamlLog(samlLogs: SamlLog[], samlSignal: SamlSignal, httpMessage: HttpMessage): void {
  const samlLog = newSamlLog(sampleSsoTraceId, samlSignal, httpMessage);
  if (samlLog instanceof Error) {
    console.error("Failed to build SAML log from sample message:", samlLog);
    return;
  }
  samlLogs.push(samlLog);
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
