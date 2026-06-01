/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

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
  sessionId: string;
  createdAt: string;
  imported: boolean;
  date?: string;
  sp?: string;
  idp?: string;
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
  authnRequest: SamlAuthnRequest;
};

// Step 3: The UA redirects the AuthnRequest to the IdP
export type OutgoingSamlAuthnRequest = SamlTraceBase & {
  step: 3;
  type: "OutgoingAuthnRequest";
  authnRequest: SamlAuthnRequest;
};

// Step 4: The IdP issues a Response
export type IncomingSamlResponse = SamlTraceBase & {
  step: 4;
  type: "IncomingResponse";
  response: SamlResponse;
};

// Step 5: The UA redirects the Response to the SP
export type OutgoingSamlResponse = SamlTraceBase & {
  step: 5;
  type: "OutgoingResponse";
  response: SamlResponse;
};

// Step 6: The SP returns the resource
export type AuthenticatedResourceResponse = SamlTraceBase & {
  step: 6;
  type: "AuthenticatedResourceResponse";
  result: unknown;
};

export type SamlAuthnRequest = {
  id: string;
  raw?: string;
};

export type SamlResponse = {
  inResponseTo: string;
  statusCode: string;
  raw?: string;
};

export function isSamlTrace(u: unknown): u is SamlTrace {
  return (
    isObject(u) &&
    typeof u.sessionId === "string" &&
    typeof u.createdAt === "string" &&
    typeof u.imported === "boolean" &&
    (!("date" in u) || typeof u.date === "string") &&
    (!("sp" in u) || typeof u.sp === "string") &&
    (!("idp" in u) || typeof u.idp === "string")
  );
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
