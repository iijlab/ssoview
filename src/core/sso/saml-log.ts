/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { type HttpMessage } from "@/core/http/http-message.ts";
import { type SamlSignal } from "@/core/sso/saml-signal.ts";
import { newLabeledDebugLogger } from "@/shared/labeled-logger.ts";
import { isObject } from "@/shared/type-guard.ts";

export type SamlLog =
  | UnauthenticatedResourceRequest
  | IncomingSamlAuthnRequest
  | OutgoingSamlAuthnRequest
  | IncomingSamlResponse
  | OutgoingSamlResponse
  | AuthenticatedResourceResponse;

type SamlLogBase = {
  id: string;
  ssoTraceId: string;
  httpMessageId: string;
  observedAt: string;
  serverHostname: string;
  action: string;
};

// [1] An unauthenticated UA requests a resource from the SP
export type UnauthenticatedResourceRequest = SamlLogBase & {
  step: 1;
  type: "UnauthenticatedResourceRequest";
};

// [2] The SP issues an AuthnRequest
export type IncomingSamlAuthnRequest = SamlLogBase & {
  step: 2;
  type: "IncomingSamlAuthnRequest";
};

// [3] The UA redirects the AuthnRequest to the IdP
export type OutgoingSamlAuthnRequest = SamlLogBase & {
  step: 3;
  type: "OutgoingSamlAuthnRequest";
};

// [4] The IdP issues a Response
export type IncomingSamlResponse = SamlLogBase & {
  step: 4;
  type: "IncomingSamlResponse";
  samlStatusCode: string;
};

// [5] The UA redirects the Response to the SP
export type OutgoingSamlResponse = SamlLogBase & {
  step: 5;
  type: "OutgoingSamlResponse";
  samlStatusCode: string;
};

// [6] The SP returns the resource
export type AuthenticatedResourceResponse = SamlLogBase & {
  step: 6;
  type: "AuthenticatedResourceResponse";
};

export function isSamlLog(u: unknown): u is SamlLog {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.ssoTraceId === "string" &&
    typeof u.httpMessageId === "string" &&
    typeof u.observedAt === "string" &&
    typeof u.serverHostname === "string" &&
    (!("samlStatusCode" in u) || typeof u.samlStatusCode === "string")
  );
}

export function newSamlLog(
  ssoTraceId: string,
  samlSignal: SamlSignal,
  httpMessage: HttpMessage,
): SamlLog | Error {
  const hostname = getHostname(httpMessage.url);
  if (hostname instanceof Error) {
    return hostname;
  }

  const base = {
    id: uuidv7(),
    ssoTraceId,
    httpMessageId: httpMessage.id,
    observedAt: httpMessage.observedAt,
    serverHostname: hostname,
  };

  switch (samlSignal.type) {
    case "UnauthenticatedResourceRequest":
      return {
        ...base,
        step: 1,
        type: samlSignal.type,
        action: "User Agent requests a secured resource at Service Provider",
      };
    case "IncomingSamlAuthnRequest":
      return {
        ...base,
        step: 2,
        type: samlSignal.type,
        action: "Service Provider issues SAML AuthnRequest",
      };
    case "OutgoingSamlAuthnRequest":
      return {
        ...base,
        step: 3,
        type: samlSignal.type,
        action:
          httpMessage.method === "POST"
            ? "User Agent submits SAML AuthnRequest to Identity Provider"
            : "User Agent redirects SAML AuthnRequest to Identity Provider",
      };
    case "IncomingSamlResponse":
      return {
        ...base,
        step: 4,
        type: samlSignal.type,
        action: "Identity Provider issues SAML Response",
        samlStatusCode: samlSignal.samlStatusCode,
      };
    case "OutgoingSamlResponse":
      return {
        ...base,
        step: 5,
        type: samlSignal.type,
        action:
          httpMessage.method === "POST"
            ? "User Agent submits SAML Response to Service Provider"
            : "User Agent redirects SAML Response to Service Provider",
        samlStatusCode: samlSignal.samlStatusCode,
      };
    case "AuthenticatedResourceResponse":
      return {
        ...base,
        step: 6,
        type: samlSignal.type,
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

export const debugSamlLog =
  import.meta.env.MODE === "development" ? debugSamlLogImpl : () => Promise.resolve();

async function debugSamlLogImpl(samlLog: SamlLog) {
  const debug = await newLabeledDebugLogger(["SAML", samlLog.ssoTraceId, samlLog.type]);
  debug({ SamlLog: samlLog });
}
