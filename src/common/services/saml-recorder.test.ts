/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FlowEntry, isFlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { type SamlTrace, isSamlTrace } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { recordSamlTrace } from "./saml-recorder.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

let storage: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();

  storage = {};
  vi.mocked(getAllSessionStorageKeys).mockImplementation(async () => Object.keys(storage));
  vi.mocked(getSessionStorageItems).mockImplementation(async (keys) =>
    Object.fromEntries(keys.filter((k) => k in storage).map((k) => [k, storage[k]])),
  );
  vi.mocked(setSessionStorageItem).mockImplementation(async (key, value) => {
    storage[key] = value;
  });
});

function storedFlowEntries(): FlowEntry[] {
  return Object.values(storage).filter((v): v is FlowEntry => isFlowEntry(v));
}

function storedSamlTraces(): SamlTrace[] {
  return Object.values(storage)
    .filter((v): v is SamlTrace => isSamlTrace(v))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

function makeRequest(): HttpRequest {
  return {
    id: "msg-0",
    createdAt: "2025-12-31T23:59:59Z",
    imported: false,
    stage: "Request",
    fetchRequestId: "req-1",
    headers: [],
    url: "https://sp.example.com/resource",
    method: "GET",
    body: "",
  } as unknown as HttpRequest;
}

function makeResponse(): HttpResponse {
  return {
    id: "msg-1",
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    stage: "Response",
    fetchRequestId: "req-1",
    headers: [{ name: "Date", value: "Thu, 01 Jan 2026 00:00:00 GMT" }],
    url: "https://sp.example.com/login",
    method: "GET",
    statusCode: 200,
    body: "",
  } as unknown as HttpResponse;
}

describe("recordSamlTrace", () => {
  it("issues a flow for an unknown correlation key and stores the trace", async () => {
    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
    );

    expect(result).toBeUndefined();
    expect(storedFlowEntries()).toEqual([
      expect.objectContaining({
        captureSessionId: "cs-1",
        protocol: "saml",
        correlationKey: "authn-req-1",
      }),
    ]);
    const samlTraces = storedSamlTraces();
    expect(samlTraces).toHaveLength(1);
    expect(samlTraces[0]).toMatchObject({ flowId: storedFlowEntries()[0]!.id });
  });

  it("stores the step 1 trace before the step 2 trace", async () => {
    const pairedHttpRequest = makeRequest();

    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
      pairedHttpRequest,
    );

    expect(result).toBeUndefined();
    const samlTraces = storedSamlTraces();
    expect(samlTraces.map((t) => t.step)).toEqual([1, 2]);
    expect(samlTraces[0]).toMatchObject({
      flowId: storedFlowEntries()[0]!.id,
      httpMessageId: pairedHttpRequest.id,
      observedAt: pairedHttpRequest.createdAt,
      serverHostname: "sp.example.com",
      sessionId: "authn-req-1",
      action: "User Agent requests a secured resource at Service Provider",
    });
  });

  it("skips the step 1 trace when the paired request is missing", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await recordSamlTrace("cs-1", 1, { step: 2, correlationKey: "authn-req-1" }, makeResponse());

    expect(storedSamlTraces().map((t) => t.step)).toEqual([2]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("does not issue a step 1 trace for steps other than 2", async () => {
    await recordSamlTrace(
      "cs-1",
      1,
      { step: 6, correlationKey: "authn-req-1" },
      makeResponse(),
      makeRequest(),
    );

    expect(storedSamlTraces().map((t) => t.step)).toEqual([6]);
  });

  it("returns an error when the step 1 trace cannot be built", async () => {
    const pairedHttpRequest = { ...makeRequest(), url: "not a url" } as HttpRequest;

    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
      pairedHttpRequest,
    );

    expect(result).toBeInstanceOf(Error);
    expect(storedSamlTraces()).toEqual([]);
  });

  it("reuses the flow of the same correlation key", async () => {
    const detection = { step: 2, correlationKey: "authn-req-1" } as const;
    await recordSamlTrace("cs-1", 1, detection, makeResponse(), makeRequest());
    await recordSamlTrace("cs-1", 1, { step: 6, correlationKey: "authn-req-1" }, makeResponse());

    expect(storedFlowEntries()).toHaveLength(1);
  });

  it("issues a flow per capture session", async () => {
    const detection = { step: 2, correlationKey: "authn-req-1" } as const;
    await recordSamlTrace("cs-1", 1, detection, makeResponse(), makeRequest());
    await recordSamlTrace("cs-2", 1, detection, makeResponse(), makeRequest());

    expect(storedFlowEntries().map((f) => f.captureSessionId)).toEqual(["cs-1", "cs-2"]);
  });

  it("returns an error when the trace cannot be built", async () => {
    const httpResponse = { ...makeResponse(), url: "not a url" } as HttpResponse;

    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      httpResponse,
      makeRequest(),
    );

    expect(result).toBeInstanceOf(Error);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage failed");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
    );

    expect(result).toBe(error);
  });
});
