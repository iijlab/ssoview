/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { isObject } from "@/shared/type-guard.ts";

export type SsoProtocol = "saml" | "oidc";

export function isSsoProtocol(u: unknown): u is SsoProtocol {
  return u === "saml" || u === "oidc";
}

export type SsoTrace = {
  id: string;
  tracingSessionId: string;
  protocol: SsoProtocol;
  // The value that ties an SSO trace to its flow varies by protocol. In SAML, it is the
  // AuthnRequest ID for an SP-Initiated flow or the Response ID for an IdP-Initiated flow.
  correlationKey: string;
};

export function isSsoTrace(u: unknown): u is SsoTrace {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.tracingSessionId === "string" &&
    isSsoProtocol(u.protocol) &&
    typeof u.correlationKey === "string"
  );
}

export function newSsoTrace(
  tracingSessionId: string,
  protocol: SsoProtocol,
  correlationKey: string,
): SsoTrace {
  return {
    id: uuidv7(),
    tracingSessionId,
    protocol,
    correlationKey,
  };
}
