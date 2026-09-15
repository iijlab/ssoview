/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { deriveSsoFlowFromSamlLogs } from "@/core/sso/saml-flow-factory.ts";
import { findSamlLogsBySsoTraceId } from "@/core/sso/saml-log-repository.ts";
import { type SsoFlow, debugSsoFlow } from "@/core/sso/sso-flow.ts";
import { findAllSsoTraces } from "@/core/sso/sso-trace-repository.ts";
import { getTracingSessions } from "@/core/tracing/tracing-session-query.ts";
import { isTracing } from "@/core/tracing/tracing-state-query.ts";

// NOTE: getSsoFlows has known inefficiencies (e.g., repeated data fetches),
// but we prioritize simplicity as performance is not a concern at current
// scale.

/**
 * Retrieve every SSO flow in every tracing session.
 *
 * @returns SSO flows, newest first, or an Error
 */
export async function getSsoFlows(): Promise<SsoFlow[] | Error> {
  const tracing = await isTracing();
  if (tracing instanceof Error) {
    return tracing;
  }

  const tracingSessions = await getTracingSessions();
  if (tracingSessions instanceof Error) {
    return tracingSessions;
  }

  const ssoTraces = await findAllSsoTraces();
  if (ssoTraces instanceof Error) {
    return ssoTraces;
  }

  const ongoingTracingSession = tracingSessions.find((s) => !s.imported && s.endedAt === undefined);
  const ongoingSsoTraceId =
    ongoingTracingSession !== undefined
      ? ssoTraces.find((t) => t.tracingSessionId === ongoingTracingSession.id)?.id
      : undefined;

  const ssoFlows: SsoFlow[] = [];
  for (const ssoTrace of ssoTraces) {
    const tracingSession = tracingSessions.find((s) => s.id === ssoTrace.tracingSessionId);
    if (tracingSession === undefined) {
      console.warn("No tracing session for the SSO trace:", { ssoTraceId: ssoTrace.id });
      continue;
    }

    const samlLogs = await findSamlLogsBySsoTraceId(ssoTrace.id);
    if (samlLogs instanceof Error) {
      return samlLogs;
    }

    const ssoFlow = {
      ...deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, samlLogs),
      live: ssoTrace.id === ongoingSsoTraceId && tracing,
    };

    ssoFlows.push(ssoFlow);
    await debugSsoFlow(ssoFlow);
  }

  return ssoFlows;
}
