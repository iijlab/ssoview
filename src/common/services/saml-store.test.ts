/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { deleteSamlTracesByFlowId, findSamlTracesByFlowId, saveSamlTrace } from "./saml-store.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  removeSessionStorageItems: vi.fn(),
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
  vi.mocked(removeSessionStorageItems).mockImplementation(async (keys) => {
    for (const key of keys) {
      delete storage[key];
    }
  });
  vi.mocked(setSessionStorageItem).mockImplementation(async (key, value) => {
    storage[key] = value;
  });
});

function makeTrace(overrides: Record<string, unknown> = {}): SamlTrace {
  return {
    id: "trace-1",
    flowId: "flow-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00Z",
    serverHostname: "sp.example.com",
    action: "test action",
    step: 2,
    type: "IncomingAuthnRequest",
    ...overrides,
  } as unknown as SamlTrace;
}

describe("saveSamlTrace", () => {
  it("stores the trace under a JSON key of the ID, kind, and flow", async () => {
    const result = await saveSamlTrace(makeTrace());

    expect(result).toBeUndefined();
    expect(storage).toEqual({
      '{"id":"trace-1","kind":"trace","flowId":"flow-1"}': makeTrace(),
    });
  });

  it("keeps traces of the same step as separate records", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-1", step: 2 }));
    await saveSamlTrace(makeTrace({ id: "trace-2", step: 2 }));

    expect(await findSamlTracesByFlowId("flow-1")).toHaveLength(2);
  });
});

describe("findSamlTracesByFlowId", () => {
  it("returns the traces of the flow in id order", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-2", flowId: "flow-1" }));
    await saveSamlTrace(makeTrace({ id: "trace-1", flowId: "flow-1" }));
    await saveSamlTrace(makeTrace({ id: "trace-3", flowId: "flow-2" }));

    const result = await findSamlTracesByFlowId("flow-1");

    expect(result).not.toBeInstanceOf(Error);
    expect((result as SamlTrace[]).map((t) => t.id)).toEqual(["trace-1", "trace-2"]);
  });

  it("reads only the items with matching keys", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-1", flowId: "flow-1" }));
    await saveSamlTrace(makeTrace({ id: "trace-2", flowId: "flow-2" }));

    await findSamlTracesByFlowId("flow-1");

    expect(getSessionStorageItems).toHaveBeenCalledWith([
      '{"id":"trace-1","kind":"trace","flowId":"flow-1"}',
    ]);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findSamlTracesByFlowId("flow-1")).toBe(error);
  });
});

describe("deleteSamlTracesByFlowId", () => {
  it("removes only the traces of the flow", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-1", flowId: "flow-1" }));
    await saveSamlTrace(makeTrace({ id: "trace-2", flowId: "flow-2" }));
    await saveSamlTrace(makeTrace({ id: "trace-3", flowId: "flow-1" }));

    const result = await deleteSamlTracesByFlowId("flow-1");

    expect(result).toBeUndefined();
    expect(getSessionStorageItems).not.toHaveBeenCalled();
    expect(((await findSamlTracesByFlowId("flow-2")) as SamlTrace[]).map((t) => t.id)).toEqual([
      "trace-2",
    ]);
    expect(await findSamlTracesByFlowId("flow-1")).toEqual([]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("storage error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await deleteSamlTracesByFlowId("flow-1")).toBe(error);
    expect(removeSessionStorageItems).not.toHaveBeenCalled();
  });

  it("propagates an error from the removal", async () => {
    const error = new Error("storage error");
    await saveSamlTrace(makeTrace({ id: "trace-1", flowId: "flow-1" }));
    vi.mocked(removeSessionStorageItems).mockResolvedValue(error);

    expect(await deleteSamlTracesByFlowId("flow-1")).toBe(error);
  });
});
