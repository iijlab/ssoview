/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";

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

type SessionSsoProtocol = "saml" | "oidc";

type SessionStatus = "in_progress" | "succeeded" | "failed";

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
