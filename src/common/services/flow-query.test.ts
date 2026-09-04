/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { findFlowEntryById } from "@/common/services/flow-store.ts";
import { findHttpMessagesByIds } from "@/common/services/http-store.ts";
import { findSamlTraces, findSamlTracesByFlowId } from "@/common/services/saml-store.ts";
import {
  findFlowEntriesByTabId,
  findFlowEntryByCorrelationKeyInTab,
  findHttpMessagesOfFlow,
} from "./flow-query.ts";

vi.mock("@/common/services/flow-store.ts", () => ({
  findFlowEntryById: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  findHttpMessagesByIds: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  findSamlTraces: vi.fn(),
  findSamlTracesByFlowId: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

//
// Helpers
//

function makeSamlTrace(httpMessageId: string, flowId = "flow-1"): SamlTrace {
  return { httpMessageId, flowId } as SamlTrace;
}

function makeFlowEntry(id: string, correlationKey = `corr-${id}`): FlowEntry {
  return { id, captureSessionId: "cs-1", protocol: "saml", correlationKey };
}

function makeRequest(id: string): HttpMessage {
  return { id, stage: "Request" } as HttpMessage;
}

function makeResponse(id: string, pairedHttpRequestId: string): HttpMessage {
  return { id, stage: "Response", pairedHttpRequestId } as HttpMessage;
}

// Serves the given messages from the mocked store by their IDs
function mockHttpStore(...httpMessages: HttpMessage[]): void {
  vi.mocked(findHttpMessagesByIds).mockImplementation(async (ids) =>
    httpMessages.filter((m) => ids.includes(m.id)),
  );
}

// Serves the given flows from the mocked store by their IDs
function mockFlowStore(...flowEntries: FlowEntry[]): void {
  vi.mocked(findFlowEntryById).mockImplementation(async (id) =>
    flowEntries.find((f) => f.id === id),
  );
}

//
// Tests
//

describe("findHttpMessagesOfFlow", () => {
  it("returns the HTTP messages referenced by the traces of the flow", async () => {
    const referenced = makeRequest("msg-1");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace("msg-1")]);
    mockHttpStore(referenced, makeRequest("msg-2"));

    const result = await findHttpMessagesOfFlow("flow-1");

    expect(findSamlTracesByFlowId).toHaveBeenCalledWith("flow-1");
    expect(findHttpMessagesByIds).toHaveBeenNthCalledWith(1, ["msg-1"]);
    expect(result).toEqual([referenced]);
  });

  it("includes the paired request of a referenced response", async () => {
    const pairedRequest = makeRequest("msg-1");
    const response = makeResponse("msg-2", "msg-1");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace("msg-2")]);
    mockHttpStore(pairedRequest, response);

    const result = await findHttpMessagesOfFlow("flow-1");

    expect(findHttpMessagesByIds).toHaveBeenNthCalledWith(2, ["msg-1"]);
    expect(result).toEqual([pairedRequest, response]);
  });

  it("does not look up a paired request that a trace references itself", async () => {
    const pairedRequest = makeRequest("msg-1");
    const response = makeResponse("msg-2", "msg-1");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([
      makeSamlTrace("msg-1"),
      makeSamlTrace("msg-2"),
    ]);
    mockHttpStore(pairedRequest, response);

    const result = await findHttpMessagesOfFlow("flow-1");

    expect(findHttpMessagesByIds).toHaveBeenNthCalledWith(2, []);
    expect(result).toEqual([pairedRequest, response]);
  });

  it("returns an error when the traces cannot be found", async () => {
    const error = new Error("saml store error");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue(error);

    expect(await findHttpMessagesOfFlow("flow-1")).toBe(error);
    expect(findHttpMessagesByIds).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be found", async () => {
    const error = new Error("http store error");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([]);
    vi.mocked(findHttpMessagesByIds).mockResolvedValue(error);

    expect(await findHttpMessagesOfFlow("flow-1")).toBe(error);
  });

  it("returns an error when the paired requests cannot be found", async () => {
    const error = new Error("http store error");
    vi.mocked(findSamlTracesByFlowId).mockResolvedValue([makeSamlTrace("msg-2")]);
    vi.mocked(findHttpMessagesByIds)
      .mockResolvedValueOnce([makeResponse("msg-2", "msg-1")])
      .mockResolvedValueOnce(error);

    expect(await findHttpMessagesOfFlow("flow-1")).toBe(error);
  });
});

describe("findFlowEntriesByTabId", () => {
  it("returns the flows of the traces in the tab, newest first", async () => {
    const flow1 = makeFlowEntry("flow-1");
    const flow2 = makeFlowEntry("flow-2");
    vi.mocked(findSamlTraces).mockResolvedValue([
      makeSamlTrace("msg-1", "flow-1"),
      makeSamlTrace("msg-2", "flow-1"),
      makeSamlTrace("msg-3", "flow-2"),
    ]);
    mockFlowStore(flow1, flow2);

    const result = await findFlowEntriesByTabId(1);

    expect(findSamlTraces).toHaveBeenCalledWith(1);
    expect(findFlowEntryById).toHaveBeenCalledTimes(2);
    expect(result).toEqual([flow2, flow1]);
  });

  it("returns an empty array when the tab has no traces", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([]);

    expect(await findFlowEntriesByTabId(1)).toEqual([]);
    expect(findFlowEntryById).not.toHaveBeenCalled();
  });

  it("skips traces without a flow entry with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const flow1 = makeFlowEntry("flow-1");
    vi.mocked(findSamlTraces).mockResolvedValue([
      makeSamlTrace("msg-1", "flow-1"),
      makeSamlTrace("msg-2", "flow-x"),
    ]);
    mockFlowStore(flow1);

    expect(await findFlowEntriesByTabId(1)).toEqual([flow1]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("returns an error when the traces cannot be found", async () => {
    const error = new Error("saml store error");
    vi.mocked(findSamlTraces).mockResolvedValue(error);

    expect(await findFlowEntriesByTabId(1)).toBe(error);
    expect(findFlowEntryById).not.toHaveBeenCalled();
  });

  it("returns an error when a flow cannot be found", async () => {
    const error = new Error("flow store error");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace("msg-1")]);
    vi.mocked(findFlowEntryById).mockResolvedValue(error);

    expect(await findFlowEntriesByTabId(1)).toBe(error);
  });
});

describe("findFlowEntryByCorrelationKeyInTab", () => {
  it("returns the flow with the correlation key among the flows of the tab", async () => {
    const flow2 = makeFlowEntry("flow-2");
    vi.mocked(findSamlTraces).mockResolvedValue([
      makeSamlTrace("msg-1", "flow-1"),
      makeSamlTrace("msg-2", "flow-2"),
    ]);
    mockFlowStore(makeFlowEntry("flow-1"), flow2);

    expect(await findFlowEntryByCorrelationKeyInTab(1, "corr-flow-2")).toEqual(flow2);
  });

  it("returns undefined when no flow of the tab has the correlation key", async () => {
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace("msg-1", "flow-1")]);
    mockFlowStore(makeFlowEntry("flow-1"));

    expect(await findFlowEntryByCorrelationKeyInTab(1, "corr-x")).toBeUndefined();
  });

  it("returns an error when the flows cannot be found", async () => {
    const error = new Error("saml store error");
    vi.mocked(findSamlTraces).mockResolvedValue(error);

    expect(await findFlowEntryByCorrelationKeyInTab(1, "corr-flow-1")).toBe(error);
  });
});
