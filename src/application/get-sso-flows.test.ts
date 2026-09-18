/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SamlLog } from "@/core/sso/saml-log.ts";
import { findSamlLogsBySsoTraceId } from "@/core/sso/saml-log-repository.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { findAllSsoTraces } from "@/core/sso/sso-trace-repository.ts";
import { type TracingSession } from "@/core/tracing/tracing-session.ts";
import { getTracingSessions } from "@/core/tracing/tracing-session-query.ts";
import { getSsoFlows } from "./get-sso-flows.ts";

vi.mock("@/core/tracing/tracing-session-query.ts", () => ({
  getTracingSessions: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-repository.ts", () => ({
  findAllSsoTraces: vi.fn(),
}));

vi.mock("@/core/sso/saml-log-repository.ts", () => ({
  findSamlLogsBySsoTraceId: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getTracingSessions).mockResolvedValue([]);
  vi.mocked(findAllSsoTraces).mockResolvedValue([]);
  vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([]);
});

//
// Helpers
//

function makeSamlLog(overrides: Partial<SamlLog>): SamlLog {
  return {
    id: "saml-log-1",
    ssoTraceId: "sso-trace-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00.000Z",
    serverHostname: "sp.example.com",
    action: "test action",
    step: 2,
    type: "IncomingSamlAuthnRequest",
    ...overrides,
  } as SamlLog;
}

function makeSsoTrace(overrides: Partial<SsoTrace> = {}): SsoTrace {
  return {
    id: "sso-trace-1",
    tracingSessionId: "tracing-session-1",
    protocol: "saml",
    correlationKey: "correlation-key-1",
    ...overrides,
  };
}

function makeTracingSession(overrides: Partial<TracingSession> = {}): TracingSession {
  return {
    id: "tracing-session-1",
    imported: false,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    ...overrides,
  } as TracingSession;
}

//
// Tests
//

describe("getSsoFlows", () => {
  it("returns an empty array when no tracing session exists", async () => {
    expect(await getSsoFlows()).toEqual([]);
  });

  it("derives one SSO flow per SSO trace in the given order", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ id: "tracing-session-2" }),
      makeTracingSession({ id: "tracing-session-1" }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({
        id: "sso-trace-2",
        tracingSessionId: "tracing-session-2",
        correlationKey: "correlation-key-2",
      }),
      makeSsoTrace({ id: "sso-trace-1", correlationKey: "correlation-key-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockImplementation(async (ssoTraceId) =>
      ssoTraceId === "sso-trace-1"
        ? [
            makeSamlLog({
              id: "saml-log-1",
              ssoTraceId: "sso-trace-1",
              step: 2,
              action: "first action",
            }),
            makeSamlLog({
              id: "saml-log-2",
              ssoTraceId: "sso-trace-1",
              step: 3,
              action: "second action",
            }),
          ]
        : [
            makeSamlLog({
              id: "saml-log-3",
              ssoTraceId: "sso-trace-2",
              step: 2,
              action: "other action",
            }),
          ],
    );

    const result = await getSsoFlows();

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject([
      { id: "sso-trace-2", action: "other action" },
      { id: "sso-trace-1", action: "second action" },
    ]);
  });

  it("derives imported from the tracing session", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ imported: true, importedAt: "2026-01-01T00:00:00Z" }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);

    expect(await getSsoFlows()).toMatchObject([{ imported: true, live: false }]);
  });

  it("sets live on the newest SSO trace of the ongoing tracing session", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ endedAt: undefined })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({ id: "sso-trace-2", correlationKey: "correlation-key-2" }),
      makeSsoTrace({ id: "sso-trace-1", correlationKey: "correlation-key-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);

    expect(await getSsoFlows()).toMatchObject([
      { id: "sso-trace-2", live: true },
      { id: "sso-trace-1", live: false },
    ]);
  });

  it("sets live on the newest SSO trace of the ongoing tracing session, not of an import", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({
        id: "tracing-session-2",
        imported: true,
        importedAt: "2026-01-01T00:02:00Z",
      }),
      makeTracingSession({ id: "tracing-session-1", endedAt: undefined }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({
        id: "sso-trace-2",
        tracingSessionId: "tracing-session-2",
        correlationKey: "correlation-key-2",
      }),
      makeSsoTrace({ id: "sso-trace-1", correlationKey: "correlation-key-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);

    expect(await getSsoFlows()).toMatchObject([
      { id: "sso-trace-2", live: false },
      { id: "sso-trace-1", live: true },
    ]);
  });

  it("does not set live when the tracing session has ended", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);

    expect(await getSsoFlows()).toMatchObject([{ live: false }]);
  });

  it("skips an SSO trace whose tracing session is missing with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ id: "tracing-session-2" }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);

    expect(await getSsoFlows()).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(findSamlLogsBySsoTraceId).not.toHaveBeenCalled();
  });

  it("propagates an error from the tracing session query", async () => {
    const error = new Error("error");
    vi.mocked(getTracingSessions).mockResolvedValue(error);

    expect(await getSsoFlows()).toBe(error);
  });

  it("propagates an error from the SSO trace store", async () => {
    const error = new Error("error");
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue(error);

    expect(await getSsoFlows()).toBe(error);
  });

  it("propagates an error from the log store", async () => {
    const error = new Error("error");
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue(error);

    expect(await getSsoFlows()).toBe(error);
  });
});
