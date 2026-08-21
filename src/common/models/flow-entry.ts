/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { isObject } from "@/common/utils/type-guard.ts";

export type SsoProtocol = "saml" | "oidc";

export function isSsoProtocol(u: unknown): u is SsoProtocol {
  return u === "saml" || u === "oidc";
}

export type FlowEntry = {
  id: string;
  captureSessionId: string;
  protocol: SsoProtocol;
  // The value that ties an SSO trace to its flow varies by protocol. In SAML, it is the
  // AuthnRequest ID for an SP-Initiated flow or the Response ID for an IdP-Initiated flow.
  correlationKey: string;
};

export function isFlowEntry(u: unknown): u is FlowEntry {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    typeof u.captureSessionId === "string" &&
    isSsoProtocol(u.protocol) &&
    typeof u.correlationKey === "string"
  );
}

export function newFlowEntry(
  captureSessionId: string,
  protocol: SsoProtocol,
  correlationKey: string,
): FlowEntry {
  return {
    id: uuidv7(),
    captureSessionId,
    protocol,
    correlationKey,
  };
}
