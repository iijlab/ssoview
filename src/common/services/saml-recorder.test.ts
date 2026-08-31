/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FlowEntry, isFlowEntry } from "@/common/models/flow-entry.ts";
import { type HttpResponse } from "@/common/models/http-message.ts";
import { isSamlTrace } from "@/common/models/saml-trace.ts";
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
    const samlTraces = Object.values(storage).filter((v) => isSamlTrace(v));
    expect(samlTraces).toHaveLength(1);
    expect(samlTraces[0]).toMatchObject({ flowId: storedFlowEntries()[0]!.id });
  });

  it("reuses the flow of the same correlation key", async () => {
    await recordSamlTrace("cs-1", 1, { step: 2, correlationKey: "authn-req-1" }, makeResponse());
    await recordSamlTrace("cs-1", 1, { step: 6, correlationKey: "authn-req-1" }, makeResponse());

    expect(storedFlowEntries()).toHaveLength(1);
  });

  it("issues a flow per capture session", async () => {
    await recordSamlTrace("cs-1", 1, { step: 2, correlationKey: "authn-req-1" }, makeResponse());
    await recordSamlTrace("cs-2", 1, { step: 2, correlationKey: "authn-req-1" }, makeResponse());

    expect(storedFlowEntries().map((f) => f.captureSessionId)).toEqual(["cs-1", "cs-2"]);
  });

  it("returns an error when the trace cannot be built", async () => {
    const httpResponse = { ...makeResponse(), url: "not a url" } as HttpResponse;

    const result = await recordSamlTrace(
      "cs-1",
      1,
      { step: 2, correlationKey: "authn-req-1" },
      httpResponse,
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
