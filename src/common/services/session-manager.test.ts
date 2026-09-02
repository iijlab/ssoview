/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { getCaptureSession } from "@/common/services/capture-query.ts";
import { findFlowEntryById } from "@/common/services/flow-store.ts";
import { purgeHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlTraces, findSamlTraces } from "@/common/services/saml-store.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";
import { deleteSession, getSessionSummaries } from "./session-manager.ts";

vi.mock("@/common/services/capture-query.ts", () => ({
  getCaptureSession: vi.fn(),
}));

vi.mock("@/common/services/flow-store.ts", () => ({
  findFlowEntryById: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  purgeHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  deleteSamlTraces: vi.fn(),
  findSamlTraces: vi.fn(),
}));

vi.mock("@/common/utils/chrome-debugger.ts", () => ({
  isAttached: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(findSamlTraces).mockResolvedValue([]);
  vi.mocked(getCaptureSession).mockResolvedValue(undefined);
  vi.mocked(findFlowEntryById).mockResolvedValue(undefined);
  vi.mocked(isAttached).mockResolvedValue(false);
  vi.mocked(deleteSamlTraces).mockResolvedValue(undefined);
  vi.mocked(purgeHttpMessages).mockResolvedValue(undefined);
});

//
// Helpers
//

function makeSamlTrace(overrides: Partial<SamlTrace>): SamlTrace {
  return {
    id: "trace-1",
    flowId: "flow-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00.000Z",
    serverHostname: "sp.example.com",
    sessionId: "corr-1",
    imported: false,
    action: "test action",
    step: 2,
    type: "IncomingAuthnRequest",
    ...overrides,
  } as SamlTrace;
}

function makeFlowEntry(overrides: Partial<FlowEntry> = {}): FlowEntry {
  return {
    id: "flow-1",
    captureSessionId: "cs-1",
    protocol: "saml",
    correlationKey: "corr-1",
    ...overrides,
  };
}

function makeCaptureSession(overrides: Partial<CaptureSession> = {}): CaptureSession {
  return {
    id: "cs-1",
    imported: false,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    ...overrides,
  } as CaptureSession;
}

//
// Tests
//

describe("getSessionSummaries", () => {
  it("returns an empty array when no traces exist", async () => {
    expect(await getSessionSummaries(1)).toEqual([]);
  });

  it("builds one summary per flow, newest flow first", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([
      makeSamlTrace({ id: "trace-1", flowId: "flow-1", step: 2, action: "first action" }),
      makeSamlTrace({ id: "trace-2", flowId: "flow-1", step: 3, action: "second action" }),
      makeSamlTrace({ id: "trace-3", flowId: "flow-2", step: 2, action: "other action" }),
    ]);
    vi.mocked(getCaptureSession).mockResolvedValue(makeCaptureSession());
    vi.mocked(findFlowEntryById).mockImplementation(async (id) =>
      id === "flow-1"
        ? makeFlowEntry({ id: "flow-1", correlationKey: "corr-1" })
        : makeFlowEntry({ id: "flow-2", correlationKey: "corr-2" }),
    );

    const result = await getSessionSummaries(1);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject([
      { sessionId: "corr-2", action: "other action" },
      { sessionId: "corr-1", action: "second action" },
    ]);
  });

  it("derives imported from the capture session", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({ imported: false })]);
    vi.mocked(getCaptureSession).mockResolvedValue(
      makeCaptureSession({ imported: true, importedAt: "2026-01-01T00:00:00Z" }),
    );
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());

    const result = await getSessionSummaries(1);

    expect(result).toMatchObject([{ imported: true, capturing: false }]);
  });

  it("sets capturing when the capture session is ongoing and the debugger is attached", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(getCaptureSession).mockResolvedValue(makeCaptureSession({ endedAt: undefined }));
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());
    vi.mocked(isAttached).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: true }]);
  });

  it("does not set capturing when the capture session has ended", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(getCaptureSession).mockResolvedValue(makeCaptureSession());
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());
    vi.mocked(isAttached).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("does not set capturing when the debugger is not attached", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(getCaptureSession).mockResolvedValue(makeCaptureSession({ endedAt: undefined }));
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());
    vi.mocked(isAttached).mockResolvedValue(false);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("skips traces without a flow entry with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({ flowId: "flow-x" })]);

    expect(await getSessionSummaries(1)).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("propagates an error from the trace store", async () => {
    const error = new Error("trace store error");
    vi.mocked(findSamlTraces).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the capture session query", async () => {
    const error = new Error("capture query error");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());
    vi.mocked(getCaptureSession).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the flow store", async () => {
    const error = new Error("flow store error");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(findFlowEntryById).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("skips a flow whose capture session is missing with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());

    expect(await getSessionSummaries(1)).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("propagates an error from the debugger", async () => {
    const error = new Error("debugger error");
    vi.mocked(isAttached).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });
});

describe("deleteSession", () => {
  it("deletes the traces and the HTTP messages", async () => {
    expect(await deleteSession(1, "corr-1")).toBeUndefined();
    expect(deleteSamlTraces).toHaveBeenCalledWith(1, "corr-1");
    expect(purgeHttpMessages).toHaveBeenCalledWith(1, "corr-1");
  });

  it("returns an error when the trace deletion fails", async () => {
    const error = new Error("saml delete error");
    vi.mocked(deleteSamlTraces).mockResolvedValue(error);

    expect(await deleteSession(1, "corr-1")).toBe(error);
    expect(purgeHttpMessages).not.toHaveBeenCalled();
  });

  it("ignores a failure of the HTTP message purge", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(purgeHttpMessages).mockResolvedValue(new Error("http purge error"));

    expect(await deleteSession(1, "corr-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });
});
