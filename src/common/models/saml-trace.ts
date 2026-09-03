/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlDetection } from "@/common/models/saml-detection.ts";
import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export type SamlTrace =
  | UnauthenticatedResourceRequest
  | IncomingSamlAuthnRequest
  | OutgoingSamlAuthnRequest
  | IncomingSamlResponse
  | OutgoingSamlResponse
  | AuthenticatedResourceResponse;

type SamlTraceBase = {
  id: string;
  flowId: string;
  httpMessageId: string;
  observedAt: string;
  serverHostname: string;
  sessionId: string;
  action: string;
};

// Step 1: An unauthenticated UA requests a resource from the SP
export type UnauthenticatedResourceRequest = SamlTraceBase & {
  step: 1;
  type: "UnauthenticatedResourceRequest";
};

// Step 2: The SP issues an AuthnRequest
export type IncomingSamlAuthnRequest = SamlTraceBase & {
  step: 2;
  type: "IncomingAuthnRequest";
};

// Step 3: The UA redirects the AuthnRequest to the IdP
export type OutgoingSamlAuthnRequest = SamlTraceBase & {
  step: 3;
  type: "OutgoingAuthnRequest";
};

// Step 4: The IdP issues a Response
export type IncomingSamlResponse = SamlTraceBase & {
  step: 4;
  type: "IncomingResponse";
  samlStatusCode: string;
};

// Step 5: The UA redirects the Response to the SP
export type OutgoingSamlResponse = SamlTraceBase & {
  step: 5;
  type: "OutgoingResponse";
  samlStatusCode: string;
};

// Step 6: The SP returns the resource
export type AuthenticatedResourceResponse = SamlTraceBase & {
  step: 6;
  type: "AuthenticatedResourceResponse";
};

export function isSamlTrace(u: unknown): u is SamlTrace {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.flowId === "string" &&
    typeof u.httpMessageId === "string" &&
    typeof u.observedAt === "string" &&
    typeof u.serverHostname === "string" &&
    typeof u.sessionId === "string" &&
    (!("samlStatusCode" in u) || typeof u.samlStatusCode === "string")
  );
}

export function newSamlTrace(
  flowId: string,
  detection: SamlDetection,
  httpMessage: HttpMessage,
): SamlTrace | Error {
  const hostname = getHostname(httpMessage.url);
  if (hostname instanceof Error) {
    return hostname;
  }

  const base = {
    id: uuidv7(),
    flowId,
    httpMessageId: httpMessage.id,
    observedAt: httpMessage.createdAt,
    serverHostname: hostname,
    sessionId: detection.correlationKey,
  };

  switch (detection.step) {
    case 1:
      return {
        ...base,
        step: 1,
        type: "UnauthenticatedResourceRequest",
        action: "User Agent requests a secured resource at Service Provider",
      };
    case 2:
      return {
        ...base,
        step: 2,
        type: "IncomingAuthnRequest",
        action: "Service Provider issues SAML AuthnRequest",
      };
    case 3:
      return {
        ...base,
        step: 3,
        type: "OutgoingAuthnRequest",
        action:
          httpMessage.method === "POST"
            ? "User Agent submits SAML AuthnRequest to Identity Provider"
            : "User Agent redirects SAML AuthnRequest to Identity Provider",
      };
    case 4:
      return {
        ...base,
        step: 4,
        type: "IncomingResponse",
        action: "Identity Provider issues SAML Response",
        samlStatusCode: detection.samlStatusCode,
      };
    case 5:
      return {
        ...base,
        step: 5,
        type: "OutgoingResponse",
        action:
          httpMessage.method === "POST"
            ? "User Agent submits SAML Response to Service Provider"
            : "User Agent redirects SAML Response to Service Provider",
        samlStatusCode: detection.samlStatusCode,
      };
    case 6:
      return {
        ...base,
        step: 6,
        type: "AuthenticatedResourceResponse",
        action: "Service Provider returns the requested resource",
      };
  }
}

function getHostname(url: string): string | Error {
  try {
    return new URL(url).hostname;
  } catch (err) {
    return new Error("Failed to extract hostname from url", { cause: err });
  }
}

//
// Debug utilities
//

export const debugSamlTrace =
  import.meta.env.MODE === "development" ? debugSamlTraceImpl : () => Promise.resolve();

async function debugSamlTraceImpl(samlTrace: SamlTrace) {
  const debug = await createLabeledDebugLogger([
    "SAML",
    samlTrace.sessionId,
    `Step ${samlTrace.step}`,
  ]);
  debug({ [samlTrace.type]: samlTrace });
}
