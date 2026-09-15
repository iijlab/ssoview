/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/core/http/http-message.ts";
import { deleteHttpMessages } from "@/core/http/http-message-repository.ts";
import { type SamlLog } from "@/core/sso/saml-log.ts";
import {
  deleteSamlLogsBySsoTraceId,
  findSamlLogsBySsoTraceId,
} from "@/core/sso/saml-log-repository.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import {
  deleteSsoTrace,
  findAllSsoTraces,
  findSsoTraceById,
} from "@/core/sso/sso-trace-repository.ts";
import { type TracingSession } from "@/core/tracing/tracing-session.ts";
import { getTracingSessions } from "@/core/tracing/tracing-session-query.ts";
import { isTracing } from "@/core/tracing/tracing-state-query.ts";
import {
  deleteSession,
  deleteSsoFlow,
  getSessionSummaries,
  getSsoFlows,
} from "./session-manager.ts";

vi.mock("@/core/tracing/tracing-session-query.ts", () => ({
  getTracingSessions: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-query.ts", () => ({
  getHttpMessagesBySsoTraceId: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-repository.ts", () => ({
  deleteSsoTrace: vi.fn(),
  findAllSsoTraces: vi.fn(),
  findSsoTraceById: vi.fn(),
}));

vi.mock("@/core/http/http-message-repository.ts", () => ({
  deleteHttpMessages: vi.fn(),
}));

vi.mock("@/core/sso/saml-log-repository.ts", () => ({
  deleteSamlLogsBySsoTraceId: vi.fn(),
  findSamlLogsBySsoTraceId: vi.fn(),
}));

vi.mock("@/core/tracing/tracing-state-query.ts", () => ({
  isTracing: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getTracingSessions).mockResolvedValue([]);
  vi.mocked(isTracing).mockResolvedValue(false);
  vi.mocked(findAllSsoTraces).mockResolvedValue([]);
  vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([]);
  vi.mocked(findSsoTraceById).mockResolvedValue(makeSsoTrace());
  vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue([]);
  vi.mocked(deleteSamlLogsBySsoTraceId).mockResolvedValue(undefined);
  vi.mocked(deleteSsoTrace).mockResolvedValue(undefined);
  vi.mocked(deleteHttpMessages).mockResolvedValue(undefined);
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
    vi.mocked(isTracing).mockResolvedValue(true);

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
    vi.mocked(isTracing).mockResolvedValue(true);

    expect(await getSsoFlows()).toMatchObject([
      { id: "sso-trace-2", live: false },
      { id: "sso-trace-1", live: true },
    ]);
  });

  it("does not set live when the tracing session has ended", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(true);

    expect(await getSsoFlows()).toMatchObject([{ live: false }]);
  });

  it("does not set live when no tracing is running", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ endedAt: undefined })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(false);

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

  it("propagates an error from the tracing state", async () => {
    const error = new Error("error");
    vi.mocked(isTracing).mockResolvedValue(error);

    expect(await getSsoFlows()).toBe(error);
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

describe("deleteSsoFlow", () => {
  it("deletes the logs, the SSO trace, and then the HTTP messages of the SSO trace", async () => {
    const ssoTrace = makeSsoTrace();
    const httpMessages = [{ id: "msg-1" } as HttpMessage];
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(httpMessages);

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(findSsoTraceById).toHaveBeenCalledWith("sso-trace-1");
    expect(getHttpMessagesBySsoTraceId).toHaveBeenCalledWith("sso-trace-1");
    expect(deleteSamlLogsBySsoTraceId).toHaveBeenCalledWith("sso-trace-1");
    expect(deleteSsoTrace).toHaveBeenCalledWith(ssoTrace);
    expect(deleteHttpMessages).toHaveBeenCalledWith(httpMessages);
    const order = [deleteSamlLogsBySsoTraceId, deleteSsoTrace, deleteHttpMessages].map(
      (fn) => vi.mocked(fn).mock.invocationCallOrder[0]!,
    );
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it("does nothing with a warning when no SSO trace has the ID", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findSsoTraceById).mockResolvedValue(undefined);

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace cannot be found", async () => {
    const error = new Error("error");
    vi.mocked(findSsoTraceById).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be found", async () => {
    const error = new Error("error");
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the log deletion fails", async () => {
    const error = new Error("error");
    vi.mocked(deleteSamlLogsBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSsoTrace).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace deletion fails", async () => {
    const error = new Error("error");
    vi.mocked(deleteSsoTrace).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("ignores a failure of the HTTP message deletion", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(deleteHttpMessages).mockResolvedValue(new Error("error"));

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });
});

//
// Legacy interface for the side panel
//

describe("getSessionSummaries", () => {
  it("maps SSO flows to the legacy shape", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ endedAt: undefined })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([
      makeSamlLog({ step: 6, type: "AuthenticatedResourceResponse" }),
    ]);
    vi.mocked(isTracing).mockResolvedValue(true);

    const result = await getSessionSummaries(1);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toEqual([
      expect.objectContaining({
        sessionId: "sso-trace-1",
        capturing: true,
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(result).not.toEqual([expect.objectContaining({ id: "sso-trace-1" })]);
  });

  it("propagates an error", async () => {
    const error = new Error("error");
    vi.mocked(isTracing).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });
});

describe("deleteSession", () => {
  it("delegates to deleteSsoFlow", async () => {
    expect(await deleteSession(1, "sso-trace-1")).toBeUndefined();
    expect(deleteSsoTrace).toHaveBeenCalledWith(makeSsoTrace());
  });
});
