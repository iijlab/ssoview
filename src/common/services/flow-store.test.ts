/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FlowEntry, newFlowEntry } from "@/common/models/flow-entry.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import {
  findFlowEntriesByCaptureSessionId,
  findFlowEntryByCorrelationKey,
  findFlowEntryById,
  saveFlowEntry,
} from "./flow-store.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function keyOf(flow: { id: string; captureSessionId: string; correlationKey: string }): string {
  return `{"id":"${flow.id}","kind":"flow","captureSessionId":"${flow.captureSessionId}","correlationKey":"${flow.correlationKey}"}`;
}

// Puts the flows into the mocked storage, in the given order of keys
function mockStorage(...flows: FlowEntry[]): void {
  const items = Object.fromEntries(flows.map((f) => [keyOf(f), f]));
  vi.mocked(getAllSessionStorageKeys).mockResolvedValue(Object.keys(items));
  vi.mocked(getSessionStorageItems).mockImplementation(async (keys) =>
    Object.fromEntries(keys.filter((k) => k in items).map((k) => [k, items[k]])),
  );
}

describe("saveFlowEntry", () => {
  it("stores the flow under a JSON key of the ID, kind, capture session, and correlation key", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const flow = newFlowEntry("cs-1", "saml", "_authn-request-id");

    const result = await saveFlowEntry(flow);

    expect(result).toBeUndefined();
    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(keyOf(flow), flow);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage failed");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await saveFlowEntry(newFlowEntry("cs-1", "saml", "key"));

    expect(result).toBe(error);
  });
});

describe("findFlowEntriesByCaptureSessionId", () => {
  it("retrieves the flows of the capture session, newest first", async () => {
    const first = newFlowEntry("cs-1", "saml", "key-1");
    const second = newFlowEntry("cs-1", "saml", "key-2");
    const third = newFlowEntry("cs-1", "saml", "key-3");
    mockStorage(second, third, first);

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toEqual([third, second, first]);
  });

  it("excludes the flows of other capture sessions", async () => {
    const target = newFlowEntry("cs-1", "saml", "key");
    mockStorage(newFlowEntry("cs-2", "saml", "key"), target);

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toEqual([target]);
  });

  it("returns an empty array when the capture session has no flow", async () => {
    mockStorage(newFlowEntry("cs-2", "saml", "key"));

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toEqual([]);
  });

  it("ignores keys that are not flow entry keys", async () => {
    const flow = newFlowEntry("cs-1", "saml", "key");
    mockStorage(flow);
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([
      "not-a-json-key",
      `{"id":"x","kind":"event","type":"CaptureStarted"}`,
      `{"id":"x","kind":"flow","captureSessionId":"cs-1"}`,
      keyOf(flow),
    ]);

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toEqual([flow]);
  });

  it("skips invalid flows with a warning", async () => {
    const valid = newFlowEntry("cs-1", "saml", "key-1");
    const invalid = { ...newFlowEntry("cs-1", "saml", "key-2"), protocol: "kerberos" };
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([keyOf(valid), keyOf(invalid)]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [keyOf(valid)]: valid,
      [keyOf(invalid)]: invalid,
    });

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toEqual([valid]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Invalid flow entry:", invalid);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("storage failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toBe(error);
  });

  it("propagates an error from the item retrieval", async () => {
    const error = new Error("storage failed");
    const flow = newFlowEntry("cs-1", "saml", "key");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([keyOf(flow)]);
    vi.mocked(getSessionStorageItems).mockResolvedValue(error);

    expect(await findFlowEntriesByCaptureSessionId("cs-1")).toBe(error);
  });
});

describe("findFlowEntryByCorrelationKey", () => {
  it("finds the flow with the correlation key in the capture session", async () => {
    const target = newFlowEntry("cs-1", "saml", "key-1");
    mockStorage(newFlowEntry("cs-1", "saml", "key-2"), target);

    expect(await findFlowEntryByCorrelationKey("cs-1", "key-1")).toEqual(target);
  });

  it("does not find a flow with the same correlation key in another capture session", async () => {
    mockStorage(newFlowEntry("cs-2", "saml", "key-1"));

    expect(await findFlowEntryByCorrelationKey("cs-1", "key-1")).toBeUndefined();
  });

  it("returns undefined when no flow has the correlation key", async () => {
    mockStorage(newFlowEntry("cs-1", "saml", "key-2"));

    expect(await findFlowEntryByCorrelationKey("cs-1", "key-1")).toBeUndefined();
  });

  it("reads only the item with the matching key", async () => {
    const target = newFlowEntry("cs-1", "saml", "key-1");
    mockStorage(newFlowEntry("cs-1", "saml", "key-2"), target);

    await findFlowEntryByCorrelationKey("cs-1", "key-1");

    expect(getSessionStorageItems).toHaveBeenCalledExactlyOnceWith([keyOf(target)]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("storage failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findFlowEntryByCorrelationKey("cs-1", "key-1")).toBe(error);
  });
});

describe("findFlowEntryById", () => {
  it("retrieves the flow with the ID", async () => {
    const target = newFlowEntry("cs-1", "saml", "key-1");
    mockStorage(newFlowEntry("cs-1", "saml", "key-2"), target);

    expect(await findFlowEntryById(target.id)).toEqual(target);
  });

  it("returns undefined when no flow has the ID", async () => {
    mockStorage(newFlowEntry("cs-1", "saml", "key-1"));

    expect(await findFlowEntryById("unknown-id")).toBeUndefined();
  });
});
