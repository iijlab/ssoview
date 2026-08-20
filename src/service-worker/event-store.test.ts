/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  newCaptureStartedRecord,
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
  newWatchStartedRecord,
} from "@/service-worker/event-record.ts";
import { retrieveAllEventRecords, storeEventRecord } from "./event-store.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

const { getAllSessionStorageKeys, getSessionStorageItems, setSessionStorageItem } =
  await import("@/common/utils/chrome-storage.ts");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("storeEventRecord", () => {
  it("stores the record under a JSON key of the ID, kind, and type", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const record = newCaptureStartedRecord();

    const result = await storeEventRecord(record);

    expect(result).toBeUndefined();
    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${record.id}","kind":"event","type":"CaptureStarted"}`,
      record,
    );
  });

  it("includes the tab ID in the key for tab-scoped records", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const record = newWatchStartedRecord(42);

    await storeEventRecord(record);

    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${record.id}","kind":"event","type":"WatchStarted","tabId":42}`,
      record,
    );
  });

  it("excludes attributes other than the ID, kind, type, and tab ID from the key", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const record = newDebuggerDetachedRecord(7, "target_closed");

    await storeEventRecord(record);

    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${record.id}","kind":"event","type":"DebuggerDetached","tabId":7}`,
      record,
    );
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage failed");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await storeEventRecord(newCaptureStartedRecord());

    expect(result).toBe(error);
  });
});

describe("retrieveAllEventRecords", () => {
  it("retrieves event records sorted by ID", async () => {
    const first = newCaptureStartedRecord();
    const second = newWatchStartedRecord(1);
    const third = newDebuggerAttachedRecord(1, false);
    const firstKey = `{"id":"${first.id}","kind":"event","type":"CaptureStarted"}`;
    const secondKey = `{"id":"${second.id}","kind":"event","type":"WatchStarted","tabId":1}`;
    const thirdKey = `{"id":"${third.id}","kind":"event","type":"DebuggerAttached","tabId":1}`;
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([thirdKey, firstKey, secondKey]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [thirdKey]: third,
      [firstKey]: first,
      [secondKey]: second,
    });

    const result = await retrieveAllEventRecords();

    expect(result).toEqual([first, second, third]);
  });

  it("requests only keys that are event record keys", async () => {
    const record = newCaptureStartedRecord();
    const key = `{"id":"${record.id}","kind":"event","type":"CaptureStarted"}`;
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([
      "not-a-json-key",
      '"CaptureStarted"',
      '{"id":"x","kind":"event","type":"TabClosed"}',
      '{"kind":"event","type":"CaptureStarted"}',
      '{"id":"x","kind":"event","type":"WatchStarted","tabId":"42"}',
      '{"id":"x","kind":"httpMessage","type":"CaptureStarted"}',
      key,
    ]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({ [key]: record });

    const result = await retrieveAllEventRecords();

    expect(result).toEqual([record]);
    expect(getSessionStorageItems).toHaveBeenCalledExactlyOnceWith([key]);
  });

  it("returns an empty array when nothing is stored", async () => {
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({});

    expect(await retrieveAllEventRecords()).toEqual([]);
  });

  it("filters out values that are not event records", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const record = newCaptureStartedRecord();
    const key = `{"id":"${record.id}","kind":"event","type":"CaptureStarted"}`;
    const brokenKey = '{"id":"broken","kind":"event","type":"WatchStarted","tabId":1}';
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([key, brokenKey]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [key]: record,
      [brokenKey]: { type: "WatchStarted" },
    });

    expect(await retrieveAllEventRecords()).toEqual([record]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("storage failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await retrieveAllEventRecords()).toBe(error);
  });

  it("propagates an error from the item retrieval", async () => {
    const error = new Error("storage failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([]);
    vi.mocked(getSessionStorageItems).mockResolvedValue(error);

    expect(await retrieveAllEventRecords()).toBe(error);
  });
});
