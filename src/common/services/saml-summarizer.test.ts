/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { getSamlSessionSummary, summarizeSamlSession } from "./saml-summarizer.ts";

vi.mock("@/common/services/saml-store.ts", () => ({
  retrieveSamlTraces: vi.fn(),
}));

const { retrieveSamlTraces } = await import("@/common/services/saml-store.ts");

beforeEach(() => {
  vi.resetAllMocks();
});

//
// Helpers
//

function makeSamlTrace(overrides: Partial<SamlTrace>): SamlTrace {
  const base = {
    sessionId: "session-1",
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    action: "test action",
    step: 2,
    type: "IncomingAuthnRequest",
    ...overrides,
  };

  // Add default response for IncomingResponse / OutgoingResponse
  if (
    (base.type === "IncomingResponse" || base.type === "OutgoingResponse") &&
    !("response" in base)
  ) {
    return {
      ...base,
      response: {
        inResponseTo: "session-1",
        statusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
      },
    } as SamlTrace;
  }

  return base as SamlTrace;
}

//
// Tests
//

describe("getSamlSessionSummary", () => {
  it("returns Error when retrieveSamlTraces fails", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue(new Error("storage error"));

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("storage error");
  });

  it("returns Error when no messages exist", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Session not found");
  });

  it("builds summary from a single message", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        date: "2026-01-01T00:00:00.000Z",
        sp: "sp.example.com",
        idp: "idp.example.org",
        action: "Service Provider issues SAML AuthnRequest",
      }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      protocol: "saml",
      sessionId: "session-1",
      imported: false,
      capturing: false,
      start: "2026-01-01T00:00:00.000Z",
      sp: "sp.example.com",
      idp: "idp.example.org",
      status: "in_progress",
      action: "Service Provider issues SAML AuthnRequest",
      warning: [],
    });
  });

  it("sets status to in_progress before AuthenticatedResourceResponse", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest" }),
      makeSamlTrace({ step: 4, type: "IncomingResponse" }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ status: "in_progress" });
  });

  it("sets status to succeeded when AuthenticatedResourceResponse is present", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ status: "succeeded" });
  });

  it("sets end only when status is succeeded", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        date: "2026-01-01T00:00:00.000Z",
      }),
      makeSamlTrace({
        step: 6,
        type: "AuthenticatedResourceResponse",
        date: "2026-01-01T00:00:05.000Z",
      }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-01T00:00:05.000Z",
    });
  });

  it("does not set end when status is in_progress", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        date: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ start: "2026-01-01T00:00:00.000Z" });
    expect((result as { end?: string }).end).toBeUndefined();
  });

  it("sets imported to true if any message is imported", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", imported: false }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest", imported: true }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ imported: true });
  });

  it("takes sp and idp from the first message that has them", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        sp: "first-sp.com",
        idp: "first-idp.com",
      }),
      makeSamlTrace({
        step: 3,
        type: "OutgoingAuthnRequest",
        sp: "second-sp.com",
        idp: "second-idp.com",
      }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ sp: "first-sp.com", idp: "first-idp.com" });
  });

  it("sets action to the last message's action", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest", action: "first action" }),
      makeSamlTrace({ step: 3, type: "OutgoingAuthnRequest", action: "second action" }),
      makeSamlTrace({ step: 4, type: "IncomingResponse", action: "third action" }),
    ]);

    const result = await getSamlSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ action: "third action" });
  });

  it("passes tabId and sessionId to retrieveSamlTraces", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
    ]);

    await getSamlSessionSummary(42, "my-session");

    expect(retrieveSamlTraces).toHaveBeenCalledWith(42, "my-session");
  });
});

describe("summarizeSamlSession", () => {
  it("builds summary from a single trace", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        date: "2026-01-01T00:00:00.000Z",
        sp: "sp.example.com",
        idp: "idp.example.org",
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
      idp: "idp.example.org",
      status: "in_progress",
      action: "Service Provider issues SAML AuthnRequest",
      warning: [],
    });
  });

  it("sets status to succeeded when AuthenticatedResourceResponse is present", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({ step: 2, type: "IncomingAuthnRequest" }),
      makeSamlTrace({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);

    expect(result).toMatchObject({ status: "succeeded" });
  });

  it("sets end only when status is succeeded", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        date: "2026-01-01T00:00:00.000Z",
      }),
      makeSamlTrace({
        step: 6,
        type: "AuthenticatedResourceResponse",
        date: "2026-01-01T00:00:05.000Z",
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
        date: "2026-01-01T00:00:00.000Z",
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

  it("takes sp and idp from the first trace that has them", () => {
    const result = summarizeSamlSession("session-1", [
      makeSamlTrace({
        step: 2,
        type: "IncomingAuthnRequest",
        sp: "first-sp.com",
        idp: "first-idp.com",
      }),
      makeSamlTrace({
        step: 3,
        type: "OutgoingAuthnRequest",
        sp: "second-sp.com",
        idp: "second-idp.com",
      }),
    ]);

    expect(result).toMatchObject({ sp: "first-sp.com", idp: "first-idp.com" });
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
