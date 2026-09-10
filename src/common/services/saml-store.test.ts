/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SamlLog } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { deleteSamlLogsBySsoTraceId, findSamlLogsBySsoTraceId, saveSamlLog } from "./saml-store.ts";

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

function makeSamlLog(overrides: Record<string, unknown> = {}): SamlLog {
  return {
    id: "trace-1",
    ssoTraceId: "flow-1",
    httpMessageId: "msg-1",
    observedAt: "2026-01-01T00:00:00Z",
    serverHostname: "sp.example.com",
    action: "test action",
    step: 2,
    type: "IncomingSamlAuthnRequest",
    ...overrides,
  } as unknown as SamlLog;
}

describe("saveSamlLog", () => {
  it("saves the log under a JSON key of the ID, kind, and SSO trace", async () => {
    const result = await saveSamlLog(makeSamlLog());

    expect(result).toBeUndefined();
    expect(storage).toEqual({
      '{"id":"trace-1","kind":"saml","ssoTraceId":"flow-1"}': makeSamlLog(),
    });
  });

  it("keeps logs of the same step as separate records", async () => {
    await saveSamlLog(makeSamlLog({ id: "trace-1", step: 2 }));
    await saveSamlLog(makeSamlLog({ id: "trace-2", step: 2 }));

    expect(await findSamlLogsBySsoTraceId("flow-1")).toHaveLength(2);
  });
});

describe("findSamlLogsBySsoTraceId", () => {
  it("returns the logs of the SSO trace in id order", async () => {
    await saveSamlLog(makeSamlLog({ id: "trace-2", ssoTraceId: "flow-1" }));
    await saveSamlLog(makeSamlLog({ id: "trace-1", ssoTraceId: "flow-1" }));
    await saveSamlLog(makeSamlLog({ id: "trace-3", ssoTraceId: "flow-2" }));

    const result = await findSamlLogsBySsoTraceId("flow-1");

    expect(result).not.toBeInstanceOf(Error);
    expect((result as SamlLog[]).map((l) => l.id)).toEqual(["trace-1", "trace-2"]);
  });

  it("reads only the items with matching keys", async () => {
    await saveSamlLog(makeSamlLog({ id: "trace-1", ssoTraceId: "flow-1" }));
    await saveSamlLog(makeSamlLog({ id: "trace-2", ssoTraceId: "flow-2" }));

    await findSamlLogsBySsoTraceId("flow-1");

    expect(getSessionStorageItems).toHaveBeenCalledWith([
      '{"id":"trace-1","kind":"saml","ssoTraceId":"flow-1"}',
    ]);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findSamlLogsBySsoTraceId("flow-1")).toBe(error);
  });
});

describe("deleteSamlLogsBySsoTraceId", () => {
  it("removes only the logs of the SSO trace", async () => {
    await saveSamlLog(makeSamlLog({ id: "trace-1", ssoTraceId: "flow-1" }));
    await saveSamlLog(makeSamlLog({ id: "trace-2", ssoTraceId: "flow-2" }));
    await saveSamlLog(makeSamlLog({ id: "trace-3", ssoTraceId: "flow-1" }));

    const result = await deleteSamlLogsBySsoTraceId("flow-1");

    expect(result).toBeUndefined();
    expect(getSessionStorageItems).not.toHaveBeenCalled();
    expect(((await findSamlLogsBySsoTraceId("flow-2")) as SamlLog[]).map((l) => l.id)).toEqual([
      "trace-2",
    ]);
    expect(await findSamlLogsBySsoTraceId("flow-1")).toEqual([]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("storage error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await deleteSamlLogsBySsoTraceId("flow-1")).toBe(error);
    expect(removeSessionStorageItems).not.toHaveBeenCalled();
  });

  it("propagates an error from the removal", async () => {
    const error = new Error("storage error");
    await saveSamlLog(makeSamlLog({ id: "trace-1", ssoTraceId: "flow-1" }));
    vi.mocked(removeSessionStorageItems).mockResolvedValue(error);

    expect(await deleteSamlLogsBySsoTraceId("flow-1")).toBe(error);
  });
});
