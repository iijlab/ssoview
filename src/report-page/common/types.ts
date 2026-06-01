/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export type ContentSectionId = SummarySectionId | SamlSectionId | HttpSectionId;
export type SummarySectionId = "session-summary";
export type SamlSectionId = "saml-request" | "saml-response";
export type HttpSectionId = `http-${number}`;

export type ArrowClickHandler = (sectionId: ContentSectionId) => void;
