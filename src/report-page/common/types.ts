/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type TracingSession } from "@/common/models/capture-session.ts";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";

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
