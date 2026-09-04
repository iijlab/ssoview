/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { getCaptureSessions, isCapturing } from "@/common/services/capture-query.ts";
import { findHttpMessagesOfFlow } from "@/common/services/flow-query.ts";
import {
  deleteFlowEntry,
  findAllFlowEntries,
  findFlowEntryById,
} from "@/common/services/flow-store.ts";
import { deleteHttpMessages } from "@/common/services/http-store.ts";
import { deleteSamlTracesByFlowId, findSamlTracesByFlowId } from "@/common/services/saml-store.ts";
import { deleteSession, getSessionSummaries } from "./session-manager.ts";

vi.mock("@/common/services/capture-query.ts", () => ({
  getCaptureSessions: vi.fn(),
  isCapturing: vi.fn(),
}));

vi.mock("@/common/services/flow-query.ts", () => ({
  findHttpMessagesOfFlow: vi.fn(),
}));

vi.mock("@/common/services/flow-store.ts", () => ({
  deleteFlowEntry: vi.fn(),
  findAllFlowEntries: vi.fn(),
  findFlowEntryById: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  deleteHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  deleteSamlTracesByFlowId: vi.fn(),
  findSamlTracesByFlowId: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getCaptureSessions).mockResolvedValue([]);
  vi.mocked(isCapturing).mockResolvedValue(false);
  vi.mocked(findAllFlowEntries).mockResolvedValue([]);
  vi.mocked(findSamlTracesByFlowId).mockResolvedValue([]);
  vi.mocked(findFlowEntryById).mockResolvedValue(makeFlowEntry());
  vi.mocked(findHttpMessagesOfFlow).mockResolvedValue([]);
  vi.mocked(deleteSamlTracesByFlowId).mockResolvedValue(undefined);
  vi.mocked(deleteFlowEntry).mockResolvedValue(undefined);
  vi.mocked(deleteHttpMessages).mockResolvedValue(undefined);
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
  it("returns an empty array when no capture session exists", async () => {
    expect(await getSessionSummaries(1)).toEqual([]);
  });

  it("builds one summary per flow in the given order", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([
      makeCaptureSession({ id: "cs-2" }),
      makeCaptureSession({ id: "cs-1" }),
    ]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([
      makeFlowEntry({ id: "flow-2", captureSessionId: "cs-2", correlationKey: "corr-2" }),
      makeFlowEntry({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlTracesByFlowId).mockImplementation(async (flowId) =>
      flowId === "flow-1"
        ? [
            makeSamlTrace({ id: "trace-1", flowId: "flow-1", step: 2, action: "first action" }),
            makeSamlTrace({ id: "trace-2", flowId: "flow-1", step: 3, action: "second action" }),
          ]
        : [makeSamlTrace({ id: "trace-3", flowId: "flow-2", step: 2, action: "other action" })],
    );

    const result = await getSessionSummaries(1);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject([
      { sessionId: "flow-2", action: "other action" },
      { sessionId: "flow-1", action: "second action" },
    ]);
  });

  it("derives imported from the capture session", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([
      makeCaptureSession({ imported: true, importedAt: "2026-01-01T00:00:00Z" }),
    ]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([makeFlowEntry()]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace({})]);

    expect(await getSessionSummaries(1)).toMatchObject([{ imported: true, capturing: false }]);
  });

  it("sets capturing on the newest flow of the ongoing capture session", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession({ endedAt: undefined })]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([
      makeFlowEntry({ id: "flow-2", correlationKey: "corr-2" }),
      makeFlowEntry({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(isCapturing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([
      { sessionId: "flow-2", capturing: true },
      { sessionId: "flow-1", capturing: false },
    ]);
  });

  it("sets capturing on the newest flow of the ongoing capture session, not of an import", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([
      makeCaptureSession({ id: "cs-2", imported: true, importedAt: "2026-01-01T00:02:00Z" }),
      makeCaptureSession({ id: "cs-1", endedAt: undefined }),
    ]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([
      makeFlowEntry({ id: "flow-2", captureSessionId: "cs-2", correlationKey: "corr-2" }),
      makeFlowEntry({ id: "flow-1", correlationKey: "corr-1" }),
    ]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(isCapturing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([
      { sessionId: "flow-2", capturing: false },
      { sessionId: "flow-1", capturing: true },
    ]);
  });

  it("does not set capturing when the capture session has ended", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession()]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([makeFlowEntry()]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(isCapturing).mockResolvedValue(true);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("does not set capturing when no capture is running", async () => {
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession({ endedAt: undefined })]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([makeFlowEntry()]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace({})]);
    vi.mocked(isCapturing).mockResolvedValue(false);

    expect(await getSessionSummaries(1)).toMatchObject([{ capturing: false }]);
  });

  it("skips a flow whose capture session is missing with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession({ id: "cs-2" })]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([makeFlowEntry()]);

    expect(await getSessionSummaries(1)).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(findSamlTracesByFlowId).not.toHaveBeenCalled();
  });

  it("propagates an error from the capturing state", async () => {
    const error = new Error("capture query error");
    vi.mocked(isCapturing).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the capture session query", async () => {
    const error = new Error("capture query error");
    vi.mocked(getCaptureSessions).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the flow store", async () => {
    const error = new Error("flow store error");
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession()]);
    vi.mocked(findAllFlowEntries).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });

  it("propagates an error from the trace store", async () => {
    const error = new Error("trace store error");
    vi.mocked(getCaptureSessions).mockResolvedValue([makeCaptureSession()]);
    vi.mocked(findAllFlowEntries).mockResolvedValue([makeFlowEntry()]);
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue(error);

    expect(await getSessionSummaries(1)).toBe(error);
  });
});

describe("deleteSession", () => {
  it("deletes the traces, the flow, and then the HTTP messages of the flow", async () => {
    const flowEntry = makeFlowEntry();
    const httpMessages = [{ id: "msg-1" } as HttpMessage];
    vi.mocked(findHttpMessagesOfFlow).mockResolvedValue(httpMessages);

    expect(await deleteSession(1, "flow-1")).toBeUndefined();
    expect(findFlowEntryById).toHaveBeenCalledWith("flow-1");
    expect(findHttpMessagesOfFlow).toHaveBeenCalledWith("flow-1");
    expect(deleteSamlTracesByFlowId).toHaveBeenCalledWith("flow-1");
    expect(deleteFlowEntry).toHaveBeenCalledWith(flowEntry);
    expect(deleteHttpMessages).toHaveBeenCalledWith(httpMessages);
    const order = [deleteSamlTracesByFlowId, deleteFlowEntry, deleteHttpMessages].map(
      (fn) => vi.mocked(fn).mock.invocationCallOrder[0]!,
    );
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it("does nothing with a warning when no flow has the flow ID", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findFlowEntryById).mockResolvedValue(undefined);

    expect(await deleteSession(1, "flow-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(deleteSamlTracesByFlowId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the flow cannot be found", async () => {
    const error = new Error("flow query error");
    vi.mocked(findFlowEntryById).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteSamlTracesByFlowId).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be found", async () => {
    const error = new Error("query error");
    vi.mocked(findHttpMessagesOfFlow).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteSamlTracesByFlowId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the trace deletion fails", async () => {
    const error = new Error("saml delete error");
    vi.mocked(deleteSamlTracesByFlowId).mockResolvedValue(error);

    expect(await deleteSession(1, "flow-1")).toBe(error);
    expect(deleteFlowEntry).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the flow deletion fails", async () => {
    const error = new Error("flow delete error");
    vi.mocked(deleteFlowEntry).mockResolvedValue(error);

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
