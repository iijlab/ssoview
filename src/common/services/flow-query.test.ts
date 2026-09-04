/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { findHttpMessagesByIds } from "@/common/services/http-store.ts";
import { findSamlTracesByFlowId } from "@/common/services/saml-store.ts";
import { findHttpMessagesOfFlow } from "./flow-query.ts";

vi.mock("@/common/services/http-store.ts", () => ({
  findHttpMessagesByIds: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
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
