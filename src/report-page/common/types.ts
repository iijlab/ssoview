/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/core/http/http-message.ts";
import { type SamlLog } from "@/core/sso/saml-log.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { type TracingSession } from "@/core/tracing/tracing-session.ts";

export type ContentSectionId = SummarySectionId | SamlSectionId | HttpSectionId;
export type SummarySectionId = "session-summary";
export type SamlSectionId = "saml-request" | "saml-response";
export type HttpSectionId = `http-${number}`;

export type ArrowClickHandler = (sectionId: ContentSectionId) => void;

export type FlowData = {
  ssoTrace: SsoTrace;
  tracingSession: TracingSession;
  samlLogs: SamlLog[];
  httpMessages: HttpMessage[];
};
