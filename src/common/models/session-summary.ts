/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export type SessionSummary = {
  protocol: SessionSsoProtocol;
  imported: boolean;
  capturing: boolean;
  sessionId: string;
  start?: string;
  end?: string;
  sp?: string;
  idp?: string;
  status?: SessionStatus;
  action?: string;
  warning: string[];
};

export function isSessionSummary(u: unknown): u is SessionSummary {
  return (
    isObject(u) &&
    isSessionSsoProtocol(u.protocol) &&
    typeof u.imported === "boolean" &&
    typeof u.capturing === "boolean" &&
    typeof u.sessionId === "string" &&
    (!("start" in u) || typeof u.start === "string") &&
    (!("end" in u) || typeof u.end === "string") &&
    (!("sp" in u) || typeof u.sp === "string") &&
    (!("idp" in u) || typeof u.idp === "string") &&
    (!("status" in u) || isSessionStatus(u.status)) &&
    (!("action" in u) || typeof u.action === "string") &&
    Array.isArray(u.warning) &&
    u.warning.every((w) => typeof w === "string")
  );
}

export function isSessionSummaryArray(u: unknown): u is SessionSummary[] {
  return Array.isArray(u) && u.every(isSessionSummary);
}

type SessionSsoProtocol = "saml" | "oidc";

function isSessionSsoProtocol(u: unknown): u is SessionSsoProtocol {
  return u === "saml" || u === "oidc";
}

type SessionStatus = "in_progress" | "succeeded" | "failed";

function isSessionStatus(u: unknown): u is SessionStatus {
  return u === "in_progress" || u === "succeeded" || u === "failed";
}

//
// Debug utilities
//

export const debugSessionSummary =
  import.meta.env.MODE === "development" ? debugSessionSummaryImpl : () => Promise.resolve();

async function debugSessionSummaryImpl(summary: SessionSummary) {
  const debug = await createLabeledDebugLogger([
    "SUMMARY",
    summary.sessionId,
    summary.sp ?? "unknown",
    summary.idp ?? "unknown",
    summary.start ?? "not started",
    summary.end ?? "ongoing",
    `${summary.status}`,
  ]);
  debug(summary.action, { SessionSummary: summary });
}
