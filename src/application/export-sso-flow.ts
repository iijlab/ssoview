/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type HttpArchiveJson,
  newHttpArchive,
  toHttpArchiveJson,
} from "@/core/http/http-archive.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import { findSsoTraceById } from "@/core/sso/sso-trace-repository.ts";

/**
 * Export an SSO flow as an HTTP archive JSON string.
 *
 * @param ssoTraceId - The SSO trace ID to export
 * @returns The HTTP archive JSON string, or an Error if retrieval fails
 */
export async function exportSsoFlow(ssoTraceId: string): Promise<HttpArchiveJson | Error> {
  const ssoTrace = await findSsoTraceById(ssoTraceId);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  } else if (ssoTrace === undefined) {
    return new Error("SSO trace not found");
  }

  const httpMessages = await getHttpMessagesBySsoTraceId(ssoTrace.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return toHttpArchiveJson(newHttpArchive(httpMessages));
}
