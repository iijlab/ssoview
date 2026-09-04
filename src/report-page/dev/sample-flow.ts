/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage, type HttpRequest } from "@/common/models/http-message.ts";
import { type SamlDetection } from "@/common/models/saml-detection.ts";
import { type SamlTrace, newSamlTrace } from "@/common/models/saml-trace.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
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

const sampleFlowId = "flow-sample";
const sampleCaptureSessionId = "cs-sample";

export async function buildSampleFlowData(): Promise<FlowData> {
  const sample = new URLSearchParams(window.location.search).get("sample");

  const allHttpMessages = await buildSampleHttpMessages(sample);
  const { samlTraces: allSamlTraces, correlationKey } =
    await buildSampleSamlTraces(allHttpMessages);

  const httpMessages = selectSampleHttpMessages(sample, allHttpMessages);
  const httpMessageIds = new Set(httpMessages.map((m) => m.id));
  const samlTraces = allSamlTraces.filter((t) => httpMessageIds.has(t.httpMessageId));

  const flowEntry: FlowEntry = {
    id: sampleFlowId,
    captureSessionId: sampleCaptureSessionId,
    protocol: "saml",
    correlationKey,
  };

  const captureSession: CaptureSession = {
    id: sampleCaptureSessionId,
    imported: false,
    startedAt: "2004-12-05T09:21:57.000Z",
    endedAt: "2004-12-05T09:22:06.000Z",
  };

  return { flowEntry, captureSession, samlTraces, httpMessages };
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
    stage: "Request" as const,
    observedAt: "2004-12-05T09:21:58.000Z",
    captureSessionId: sampleCaptureSessionId,
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
    stage: "Response" as const,
    observedAt: "2004-12-05T09:21:59.000Z",
    captureSessionId: sampleCaptureSessionId,
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
    stage: "Request" as const,
    observedAt: "2004-12-05T09:21:59.200Z",
    captureSessionId: sampleCaptureSessionId,
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
    stage: "Response" as const,
    observedAt: "2004-12-05T09:22:05.000Z",
    captureSessionId: sampleCaptureSessionId,
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
    stage: "Request" as const,
    observedAt: "2004-12-05T09:22:05.100Z",
    captureSessionId: sampleCaptureSessionId,
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
    stage: "Response" as const,
    observedAt: "2004-12-05T09:22:05.500Z",
    captureSessionId: sampleCaptureSessionId,
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

async function buildSampleSamlTraces(
  httpMessages: HttpMessage[],
): Promise<{ samlTraces: SamlTrace[]; correlationKey: string }> {
  const detections = await detectSampleSamlSteps(httpMessages);
  const correlationKey = detections[0]?.detection.correlationKey ?? "";

  const samlTraces: SamlTrace[] = [];
  for (const { detection, httpMessage, pairedHttpRequest } of detections) {
    if (detection.step === 2 && pairedHttpRequest !== undefined) {
      pushSamlTrace(
        samlTraces,
        { step: 1, correlationKey: detection.correlationKey },
        pairedHttpRequest,
      );
    }
    pushSamlTrace(samlTraces, detection, httpMessage);
  }

  return { samlTraces, correlationKey };
}

type SampleSamlDetection = {
  detection: SamlDetection;
  httpMessage: HttpMessage;
  pairedHttpRequest?: HttpRequest;
};

async function detectSampleSamlSteps(httpMessages: HttpMessage[]): Promise<SampleSamlDetection[]> {
  const detections: SampleSamlDetection[] = [];

  for (const httpMessage of httpMessages) {
    const pairedHttpRequest =
      httpMessage.stage === "Response"
        ? findPairedHttpRequest(httpMessage.pairedHttpRequestId, httpMessages)
        : undefined;

    const detection = await detectSamlStep(httpMessage, pairedHttpRequest);
    if (detection instanceof Error) {
      console.error("Failed to detect SAML step from sample message:", detection);
      continue;
    } else if (!detection) {
      continue;
    }

    detections.push({ detection, httpMessage, pairedHttpRequest });
  }

  return detections;
}

async function detectSamlStep(
  httpMessage: HttpMessage,
  pairedHttpRequest: HttpRequest | undefined,
): Promise<SamlDetection | undefined | Error> {
  if (httpMessage.stage === "Request") {
    return detectSamlStepFromHttpRequest(httpMessage);
  } else if (pairedHttpRequest === undefined) {
    return new Error(`No paired HTTP request for HTTP response: ${httpMessage.id}`);
  } else {
    return detectSamlStepFromHttpResponse(httpMessage, pairedHttpRequest);
  }
}

function findPairedHttpRequest(
  pairedHttpRequestId: string,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === pairedHttpRequestId);
  return pairedHttpRequest?.stage === "Request" ? pairedHttpRequest : undefined;
}

function pushSamlTrace(
  samlTraces: SamlTrace[],
  detection: SamlDetection,
  httpMessage: HttpMessage,
): void {
  const samlTrace = newSamlTrace(sampleFlowId, detection, httpMessage);
  if (samlTrace instanceof Error) {
    console.error("Failed to build SAML trace from sample message:", samlTrace);
    return;
  }
  samlTraces.push(samlTrace);
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
