/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { summarizeSamlFlow, summarizeSamlSession } from "./saml-summarizer.ts";

//
// Helpers
//

function makeSamlTrace(overrides: Partial<SamlTrace>): SamlTrace {
  const base = {
    id: "trace-1",
    flowId: "flow-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00.000Z",
    serverHostname: "sp.example.com",
    sessionId: "session-1",
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    action: "test action",
    step: 2,
    type: "IncomingAuthnRequest",
    ...overrides,
  };

  // Add default samlStatusCode for step 4 / 5
  if ((base.step === 4 || base.step === 5) && !("samlStatusCode" in base)) {
    return {
      ...base,
      samlStatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
    } as SamlTrace;
  }

  return base as SamlTrace;
}

//
// Tests
//

describe("summarizeSamlSession", () => {
  it("builds summary from a single trace", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        action: "Service Provider issues SAML AuthnRequest",
      }),
    ]);

    expect(result).toMatchObject({
      protocol: "saml",
      sessionId: "session-1",
      imported: false,
      capturing: false,
      start: "2026-01-01T00:00:00.000Z",
      sp: "sp.example.com",
      status: "in_progress",
      action: "Service Provider issues SAML AuthnRequest",
      warning: [],
    });
    expect(result.idp).toBeUndefined();
  });

  it("sets status to in_progress before step 6", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest" }),
      makeSamlTrace({ step: 4, type: "IncomingResponse" }),
    ]);

    expect(result).toMatchObject({ status: "in_progress" });
  });

  it("sets status to succeeded when a step 6 trace is present", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    expect(result).toMatchObject({ status: "succeeded" });
  });

  it("sets status to failed when the samlStatusCode is not Success", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({
        step: 4,
        type: "IncomingResponse",
        samlStatusCode: "urn:oasis:names:tc:SAML:2.0:status:Requester",
      }),
      makeSamlTrace({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    expect(result).toMatchObject({ status: "failed" });
  });

  it("sets start and end from the observedAt", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        observedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeSamlTrace({
        step: 6,
        type: "AuthenticatedResourceResponse",
        observedAt: "2026-01-01T00:00:05.000Z",
      }),
    ]);

    expect(result).toMatchObject({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:00:05.000Z",
    });
  });

  it("does not set end when status is in_progress", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        observedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    expect(result).toMatchObject({ start: "2026-01-01T00:00:00.000Z" });
    expect(result.end).toBeUndefined();
  });

  it("sets imported to true if any trace is imported", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", imported: false }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest", imported: true }),
    ]);

    expect(result).toMatchObject({ imported: true });
  });

  it("assigns the serverHostname to sp or idp by the step", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", serverHostname: "sp.example.com" }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest", serverHostname: "idp.example.org" }),
      makeSamlTrace({ step: 5, type: "OutgoingResponse", serverHostname: "second-sp.com" }),
    ]);

    expect(result).toMatchObject({ sp: "sp.example.com", idp: "idp.example.org" });
  });

  it("sets action to the last trace's action", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", action: "first action" }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest", action: "second action" }),
      makeSamlTrace({ step: 4, type: "IncomingResponse", action: "third action" }),
    ]);

    expect(result).toMatchObject({ action: "third action" });
  });
});

describe("summarizeSamlFlow", () => {
  const flowEntry: FlowEntry = {
    id: "flow-1",
    captureSessionId: "cs-1",
    protocol: "saml",
    correlationKey: "corr-1",
  };

  it("uses the correlation key of the flow as the session ID", () => {
    const captureSession: CaptureSession = {
      id: "cs-1",
      imported: false,
      startedAt: "2026-01-01T00:00:00Z",
    };

    const result = summarizeSamlFlow(flowEntry, captureSession, [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
    ]);

    expect(result).toMatchObject({ sessionId: "corr-1", imported: false });
  });

  it("derives imported from the capture session, not from the traces", () => {
    const captureSession: CaptureSession = {
      id: "cs-1",
      imported: true,
      importedAt: "2026-01-01T00:00:00Z",
    };

    const result = summarizeSamlFlow(flowEntry, captureSession, [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", imported: false }),
    ]);

    expect(result).toMatchObject({ imported: true });
  });
});
