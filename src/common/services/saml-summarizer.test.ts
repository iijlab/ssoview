/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { type TracingSession } from "@/common/models/capture-session.ts";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { deriveSsoFlowFromSamlLogs } from "./saml-summarizer.ts";

//
// Helpers
//

function makeSamlLog(overrides: Partial<SamlLog>): SamlLog {
  const base = {
    id: "trace-1",
    ssoTraceId: "flow-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00.000Z",
    serverHostname: "sp.example.com",
    action: "test action",
    step: 2,
    type: "IncomingSamlAuthnRequest",
    ...overrides,
  };

  // Add default samlStatusCode for step 4 / 5
  if ((base.step === 4 || base.step === 5) && !("samlStatusCode" in base)) {
    return {
      ...base,
      samlStatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
    } as SamlLog;
  }

  return base as SamlLog;
}

const ssoTrace: SsoTrace = {
  id: "flow-1",
  tracingSessionId: "cs-1",
  protocol: "saml",
  correlationKey: "corr-1",
};

const tracingSession: TracingSession = {
  id: "cs-1",
  imported: false,
  startedAt: "2026-01-01T00:00:00Z",
};

//
// Tests
//

describe("deriveSsoFlowFromSamlLogs", () => {
  it("derives SSO flow from a single log", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({
        step: 2,
        type: "IncomingSamlAuthnRequest",
        action: "Service Provider issues SAML AuthnRequest",
      }),
    ]);

    expect(result).toMatchObject({
      id: "flow-1",
      protocol: "saml",
      imported: false,
      live: false,
      startedAt: "2026-01-01T00:00:00.000Z",
      sp: "sp.example.com",
      status: "in_progress",
      action: "Service Provider issues SAML AuthnRequest",
      warning: [],
    });
    expect(result.idp).toBeUndefined();
  });

  it("sets status to in_progress before step 6", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest" }),
      makeSamlLog({ step: 3, type: "OutgoingSamlAuthnRequest" }),
      makeSamlLog({ step: 4, type: "IncomingSamlResponse" }),
    ]);

    expect(result).toMatchObject({ status: "in_progress" });
  });

  it("sets status to succeeded when a step 6 log is present", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest" }),
      makeSamlLog({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    expect(result).toMatchObject({ status: "succeeded" });
  });

  it("sets status to failed when the samlStatusCode is not Success", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest" }),
      makeSamlLog({
        step: 4,
        type: "IncomingSamlResponse",
        samlStatusCode: "urn:oasis:names:tc:SAML:2.0:status:Requester",
      }),
      makeSamlLog({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    expect(result).toMatchObject({ status: "failed" });
  });

  it("sets startedAt and endedAt from the observedAt", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({
        step: 2,
        type: "IncomingSamlAuthnRequest",
        observedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeSamlLog({
        step: 6,
        type: "AuthenticatedResourceResponse",
        observedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);

    expect(result).toMatchObject({
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:05.000Z",
    });
  });

  it("does not set endedAt when status is in_progress", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({
        step: 2,
        type: "IncomingSamlAuthnRequest",
        observedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    expect(result).toMatchObject({ startedAt: "2026-01-01T00:00:00.000Z" });
    expect(result.endedAt).toBeUndefined();
  });

  it("assigns the serverHostname to sp or idp by the step", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest", serverHostname: "sp.example.com" }),
      makeSamlLog({ step: 3, type: "OutgoingSamlAuthnRequest", serverHostname: "idp.example.org" }),
      makeSamlLog({ step: 5, type: "OutgoingSamlResponse", serverHostname: "second-sp.com" }),
    ]);

    expect(result).toMatchObject({ sp: "sp.example.com", idp: "idp.example.org" });
  });

  it("sets action to the last log's action", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest", action: "first action" }),
      makeSamlLog({ step: 3, type: "OutgoingSamlAuthnRequest", action: "second action" }),
      makeSamlLog({ step: 4, type: "IncomingSamlResponse", action: "third action" }),
    ]);

    expect(result).toMatchObject({ action: "third action" });
  });

  it("uses the SSO trace ID as the SSO flow ID", () => {
    const result = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest" }),
    ]);

    expect(result).toMatchObject({ id: "flow-1", imported: false });
  });

  it("derives imported from the tracing session", () => {
    const importedSession: TracingSession = {
      id: "cs-1",
      imported: true,
      importedAt: "2026-01-01T00:00:00Z",
    };

    const result = deriveSsoFlowFromSamlLogs(ssoTrace, importedSession, [
      makeSamlLog({ step: 2, type: "IncomingSamlAuthnRequest" }),
    ]);

    expect(result).toMatchObject({ imported: true });
  });
});
