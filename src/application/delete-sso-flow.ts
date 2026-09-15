/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { deleteHttpMessages } from "@/core/http/http-message-repository.ts";
import { deleteSamlLogsBySsoTraceId } from "@/core/sso/saml-log-repository.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import { deleteSsoTrace, findSsoTraceById } from "@/core/sso/sso-trace-repository.ts";

/**
 * Delete all data for a specific SSO flow.
 *
 * @param ssoTraceId - The SSO trace ID to delete
 * @returns void on success, or an Error
 */
export async function deleteSsoFlow(ssoTraceId: string): Promise<void | Error> {
  const ssoTrace = await findSsoTraceById(ssoTraceId);
  if (ssoTrace instanceof Error) {
    return ssoTrace;
  } else if (ssoTrace === undefined) {
    console.warn("No SSO trace to delete:", { ssoTraceId });
    return;
  }

  const httpMessages = await getHttpMessagesBySsoTraceId(ssoTrace.id);
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  const samlLogDeleteError = await deleteSamlLogsBySsoTraceId(ssoTrace.id);
  if (samlLogDeleteError) {
    return samlLogDeleteError;
  }

  const ssoTraceDeleteError = await deleteSsoTrace(ssoTrace);
  if (ssoTraceDeleteError) {
    return ssoTraceDeleteError;
  }

  const httpMessageDeleteError = await deleteHttpMessages(httpMessages);
  if (httpMessageDeleteError) {
    // HTTP messages don't need to be deleted, so we ignore failures
    console.warn("Failed to delete HTTP messages:", httpMessageDeleteError);
  }
}
