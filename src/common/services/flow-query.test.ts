/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import { retrieveHttpMessages } from "@/common/services/http-store.ts";
import { findSamlTraces } from "@/common/services/saml-store.ts";
import { findHttpMessagesOfFlow } from "./flow-query.ts";

vi.mock("@/common/services/http-store.ts", () => ({
  retrieveHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  findSamlTraces: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

//
// Helpers
//

function makeSamlTrace(httpMessageId: string, sessionId = "corr-1"): SamlTrace {
  return { httpMessageId, sessionId } as SamlTrace;
}

function makeRequest(id: string): HttpMessage {
  return { id, stage: "Request" } as HttpMessage;
}

function makeResponse(id: string, pairedHttpRequestId: string): HttpMessage {
  return { id, stage: "Response", pairedHttpRequestId } as HttpMessage;
}

//
// Tests
//

describe("findHttpMessagesOfFlow", () => {
  it("returns the HTTP messages referenced by the traces of the flow", async () => {
    const referenced = makeRequest("msg-1");
    const unreferenced = makeRequest("msg-2");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace("msg-1")]);
    vi.mocked(retrieveHttpMessages).mockResolvedValue([referenced, unreferenced]);

    const result = await findHttpMessagesOfFlow(1, "corr-1");

    expect(findSamlTraces).toHaveBeenCalledWith(1);
    expect(retrieveHttpMessages).toHaveBeenCalledWith(1, "corr-1");
    expect(result).toEqual([referenced]);
  });

  it("includes the paired request of a referenced response", async () => {
    const pairedRequest = makeRequest("msg-1");
    const response = makeResponse("msg-2", "msg-1");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace("msg-2")]);
    vi.mocked(retrieveHttpMessages).mockResolvedValue([pairedRequest, response]);

    const result = await findHttpMessagesOfFlow(1, "corr-1");

    expect(result).toEqual([pairedRequest, response]);
  });

  it("ignores the traces of other flows", async () => {
    const httpMessage = makeRequest("msg-1");
    vi.mocked(findSamlTraces).mockResolvedValue([makeSamlTrace("msg-1", "corr-2")]);
    vi.mocked(retrieveHttpMessages).mockResolvedValue([httpMessage]);

    const result = await findHttpMessagesOfFlow(1, "corr-1");

    expect(result).toEqual([]);
  });

  it("returns an error when the traces cannot be found", async () => {
    const error = new Error("saml store error");
    vi.mocked(findSamlTraces).mockResolvedValue(error);

    expect(await findHttpMessagesOfFlow(1, "corr-1")).toBe(error);
    expect(retrieveHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be retrieved", async () => {
    const error = new Error("http store error");
    vi.mocked(findSamlTraces).mockResolvedValue([]);
    vi.mocked(retrieveHttpMessages).mockResolvedValue(error);

    expect(await findHttpMessagesOfFlow(1, "corr-1")).toBe(error);
  });
});
