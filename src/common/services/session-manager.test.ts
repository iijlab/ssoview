/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TracingSession } from "@/common/models/capture-session.ts";
import { type SsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import { getTracingSessions, isTracing } from "@/common/services/capture-query.ts";
import { getHttpMessagesBySsoTraceId } from "@/common/services/flow-query.ts";
import {
  deleteSsoTrace,
  findAllSsoTraces,
  findSsoTraceById,
} from "@/common/services/flow-store.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import {
  deleteSamlLogsBySsoTraceId,
  findSamlLogsBySsoTraceId,
} from "@/common/services/saml-store.ts";
import { deleteSession, getSessionSummaries } from "./session-manager.ts";

vi.mock("@/common/services/capture-query.ts", () => ({
  getTracingSessions: vi.fn(),
  isTracing: vi.fn(),
}));

vi.mock("@/common/services/flow-query.ts", () => ({
  getHttpMessagesBySsoTraceId: vi.fn(),
}));

vi.mock("@/common/services/flow-store.ts", () => ({
  deleteSsoTrace: vi.fn(),
  findAllSsoTraces: vi.fn(),
  findSsoTraceById: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  deleteHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  deleteSamlLogsBySsoTraceId: vi.fn(),
  findSamlLogsBySsoTraceId: vi.fn(),
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
    id: "trace-1",
    ssoTraceId: "flow-1",
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
    id: "flow-1",
    tracingSessionId: "cs-1",
    protocol: "saml",
    correlationKey: "corr-1",
    ...overrides,
  };
}

function makeTracingSession(overrides: Partial<TracingSession> = {}): TracingSession {
  return {
    id: "cs-1",
    imported: false,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    ...overrides,
  } as TracingSession;
}

//
// Tests
//

describe("getSessionSummaries", () => {
  it("returns an empty array when no tracing session exists", async () => {
    expect(await getSessionSummaries(1)).toEqual([]);
  });

  it("builds one summary per SSO trace in the given order", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ id: "cs-2" }),
      makeTracingSession({ id: "cs-1" }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({ id: "flow-2", tracingSessionId: "cs-2", correlationKey: "corr-2" }),
      makeSsoTrace({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockImplementation(async (ssoTraceId) =>
      ssoTraceId === "flow-1"
        ? [
            makeSamlLog({ id: "trace-1", ssoTraceId: "flow-1", step: 2, action: "first action" }),
            makeSamlLog({ id: "trace-2", ssoTraceId: "flow-1", step: 3, action: "second action" }),
          ]
        : [makeSamlLog({ id: "trace-3", ssoTraceId: "flow-2", step: 2, action: "other action" })],
    );

    const result = await getSessionSummaries(1);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject([
      { sessionId: "flow-2", action: "other action" },
      { sessionId: "flow-1", action: "second action" },
    ]);
  });

  it("derives imported from the tracing session", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ imported: true, importedAt: "2026-01-01T00:00:00Z" }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);

    expect(await getSessionSummaries(1)).toMatchObject([{ imported: true, capturing: false }]);
  });

  it("sets capturing on the newest SSO trace of the ongoing tracing session", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ endedAt: undefined })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({ id: "flow-2", correlationKey: "corr-2" }),
      makeSsoTrace({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([
      { sessionId: "flow-2", capturing: true },
      { sessionId: "flow-1", capturing: false },
    ]);
  });

  it("sets capturing on the newest SSO trace of the ongoing tracing session, not of an import", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([
      makeTracingSession({ id: "cs-2", imported: true, importedAt: "2026-01-01T00:02:00Z" }),
      makeTracingSession({ id: "cs-1", endedAt: undefined }),
    ]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([
      makeSsoTrace({ id: "flow-2", tracingSessionId: "cs-2", correlationKey: "corr-2" }),
      makeSsoTrace({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([
      { sessionId: "flow-2", capturing: false },
      { sessionId: "flow-1", capturing: true },
    ]);
  });

  it("does not set capturing when the tracing session has ended", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("does not set capturing when no tracing is running", async () => {
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ endedAt: undefined })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue([makeSamlLog({})]);
    vi.mocked(isTracing).mockResolvedValue(false);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("skips an SSO trace whose tracing session is missing with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession({ id: "cs-2" })]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);

    expect(await getSessionSummaries(1)).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(findSamlLogsBySsoTraceId).not.toHaveBeenCalled();
  });

  it("propagates an error from the tracing state", async () => {
    const error = new Error("capture query error");
    vi.mocked(isTracing).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the tracing session query", async () => {
    const error = new Error("capture query error");
    vi.mocked(getTracingSessions).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the SSO trace store", async () => {
    const error = new Error("SSO trace store error");
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the log store", async () => {
    const error = new Error("log store error");
    vi.mocked(getTracingSessions).mockResolvedValue([makeTracingSession()]);
    vi.mocked(findAllSsoTraces).mockResolvedValue([makeSsoTrace()]);
    vi.mocked(findSamlLogsBySsoTraceId).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });
});

describe("deleteSession", () => {
  it("deletes the logs, the SSO trace, and then the HTTP messages of the SSO trace", async () => {
    const ssoTrace = makeSsoTrace();
    const httpMessages = [{ id: "msg-1" } as HttpMessage];
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(httpMessages);

    expect(await deleteSession(1, "flow-1")).toBeUndefined();
    expect(findSsoTraceById).toHaveBeenCalledWith("flow-1");
    expect(getHttpMessagesBySsoTraceId).toHaveBeenCalledWith("flow-1");
    expect(deleteSamlLogsBySsoTraceId).toHaveBeenCalledWith("flow-1");
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

    expect(await deleteSession(1, "flow-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace cannot be found", async () => {
    const error = new Error("SSO trace query error");
    vi.mocked(findSsoTraceById).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be found", async () => {
    const error = new Error("query error");
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the log deletion fails", async () => {
    const error = new Error("saml delete error");
    vi.mocked(deleteSamlLogsBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteSsoTrace).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace deletion fails", async () => {
    const error = new Error("SSO trace delete error");
    vi.mocked(deleteSsoTrace).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("ignores a failure of the HTTP message deletion", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(deleteHttpMessages).mockResolvedValue(new Error("http delete error"));

    expect(await deleteSession(1, "flow-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });
});
