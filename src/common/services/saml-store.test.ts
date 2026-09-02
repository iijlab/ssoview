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
import { deleteSamlTraces, findSamlTraces, saveSamlTrace } from "./saml-store.ts";

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
    sessionId: "session-1",
    imported: false,
    action: "test action",
    step: 2,
    type: "IncomingAuthnRequest",
    ...overrides,
  } as unknown as SamlTrace;
}

describe("saveSamlTrace", () => {
  it("stores the trace under a JSON key with id, kind, tabId, and flowId", async () => {
    const result = await saveSamlTrace(makeTrace(), 1);

    expect(result).toBeUndefined();
    expect(storage).toEqual({
      '{"id":"trace-1","kind":"trace","tabId":1,"flowId":"flow-1"}': makeTrace(),
    });
  });

  it("keeps traces of the same step as separate records", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-1", step: 2 }), 1);
    await saveSamlTrace(makeTrace({ id: "trace-2", step: 2 }), 1);

    expect(await findSamlTraces(1)).toHaveLength(2);
  });
});

describe("findSamlTraces", () => {
  it("returns the traces of the tab in id order", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-2" }), 1);
    await saveSamlTrace(makeTrace({ id: "trace-1" }), 1);
    await saveSamlTrace(makeTrace({ id: "trace-3" }), 2);
    storage["other-key"] = { some: "value" };

    const result = await findSamlTraces(1);

    expect(result).not.toBeInstanceOf(Error);
    expect((result as SamlTrace[]).map((t) => t.id)).toEqual(["trace-1", "trace-2"]);
  });

  it("skips an invalid stored value with a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    storage['{"id":"trace-1","kind":"trace","tabId":1,"flowId":"flow-1"}'] = { broken: true };
    await saveSamlTrace(makeTrace({ id: "trace-2" }), 1);

    const result = await findSamlTraces(1);

    expect((result as SamlTrace[]).map((t) => t.id)).toEqual(["trace-2"]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findSamlTraces(1)).toBe(error);
  });
});

describe("deleteSamlTraces", () => {
  it("removes only the traces of the tab and session", async () => {
    await saveSamlTrace(makeTrace({ id: "trace-1", sessionId: "session-1" }), 1);
    await saveSamlTrace(makeTrace({ id: "trace-2", sessionId: "session-2" }), 1);
    await saveSamlTrace(makeTrace({ id: "trace-3", sessionId: "session-1" }), 2);

    const result = await deleteSamlTraces(1, "session-1");

    expect(result).toBeUndefined();
    expect(((await findSamlTraces(1)) as SamlTrace[]).map((t) => t.id)).toEqual(["trace-2"]);
    expect(((await findSamlTraces(2)) as SamlTrace[]).map((t) => t.id)).toEqual(["trace-3"]);
  });
});
