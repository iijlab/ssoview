/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { newCaptureStartedRecord, newCaptureStoppedRecord } from "@/service-worker/event-record.ts";
import {
  isCapturing,
  registerCaptureStopHandler,
  startCapturing,
  stopCapturing,
} from "./capture-manager.ts";

vi.mock("@/service-worker/event-store.ts", () => ({
  retrieveAllEventRecords: vi.fn(),
  storeEventRecord: vi.fn(),
}));

vi.mock("@/service-worker/tab-watcher.ts", () => ({
  getWatchedTabIds: vi.fn(),
  registerWatchStopHandler: vi.fn(),
  startWatching: vi.fn(),
  stopWatching: vi.fn(),
}));

const { retrieveAllEventRecords, storeEventRecord } =
  await import("@/service-worker/event-store.ts");
const { getWatchedTabIds, registerWatchStopHandler, startWatching, stopWatching } =
  await import("@/service-worker/tab-watcher.ts");

//
// Helpers
//

type WatchStopHandler = (tabId: number) => Promise<void>;
type CaptureStopHandler = (tabId: number) => Promise<void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(storeEventRecord).mockResolvedValue(undefined);
  vi.mocked(retrieveAllEventRecords).mockResolvedValue([]);
  vi.mocked(getWatchedTabIds).mockResolvedValue([]);
  vi.mocked(startWatching).mockResolvedValue(undefined);
  vi.mocked(stopWatching).mockResolvedValue(undefined);
});

function registerAndGetHandler(onCaptureStopped: CaptureStopHandler): WatchStopHandler {
  registerCaptureStopHandler(onCaptureStopped);
  const handler = vi.mocked(registerWatchStopHandler).mock.calls[0]?.[0];
  if (handler === undefined) {
    throw new Error("No watch stop handler is registered");
  }
  return handler as WatchStopHandler;
}

// Types of the event records stored so far, in order
function storedRecordTypes(): string[] {
  return vi.mocked(storeEventRecord).mock.calls.map(([record]) => record.type);
}

//
// Tests
//

describe("startCapturing", () => {
  it("stores a CaptureStarted record before starting the watch", async () => {
    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(storeEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStarted" }),
    );
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(storeEventRecord).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startWatching).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes the capture and returns the error when the watch cannot be started", async () => {
    const error = new Error("watch failed");
    vi.mocked(startWatching).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(storedRecordTypes()).toEqual(["CaptureStarted", "CaptureStopped"]);
  });

  it("does not start the watch when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(storeEventRecord).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });

  it("closes an inconsistent capture before starting a new one", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(storedRecordTypes()).toEqual(["CaptureStopped", "CaptureStarted"]);
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not start another capture while one is in progress", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(storeEventRecord).not.toHaveBeenCalled();
    expect(startWatching).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("does not start when the inconsistent capture cannot be closed", async () => {
    const error = new Error("storage failed");
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);
    vi.mocked(storeEventRecord).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });
});

describe("stopCapturing", () => {
  it("stores a CaptureStopped record after stopping the watch", async () => {
    const result = await stopCapturing(1);

    expect(result).toBeUndefined();
    expect(stopWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(storeEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStopped" }),
    );
    expect(vi.mocked(stopWatching).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(storeEventRecord).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stores nothing when the watch cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopWatching).mockResolvedValue(error);

    const result = await stopCapturing(1);

    expect(result).toBe(error);
    expect(storeEventRecord).not.toHaveBeenCalled();
  });

  it("returns an error when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(storeEventRecord).mockResolvedValue(error);

    const result = await stopCapturing(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).cause).toBe(error);
  });
});

describe("registerCaptureStopHandler", () => {
  it("stops the capture and reports it when the watch stops", async () => {
    const onCaptureStopped = vi.fn();
    const handler = registerAndGetHandler(onCaptureStopped);

    await handler(1);

    expect(storeEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStopped" }),
    );
    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(storeEventRecord).mock.invocationCallOrder[0]).toBeLessThan(
      onCaptureStopped.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reports the stop even when the record cannot be stored", async () => {
    vi.mocked(storeEventRecord).mockResolvedValue(new Error("storage failed"));
    const onCaptureStopped = vi.fn();
    const handler = registerAndGetHandler(onCaptureStopped);

    await handler(1);

    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("isCapturing", () => {
  it("returns true when a capture has started and a tab is still watched", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(true);
  });

  it("returns false when the latest capture has stopped", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([
      newCaptureStartedRecord(),
      newCaptureStoppedRecord(),
    ]);
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(false);
    expect(getWatchedTabIds).not.toHaveBeenCalled();
  });

  it("returns true when a capture has started again after stopping", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([
      newCaptureStartedRecord(),
      newCaptureStoppedRecord(),
      newCaptureStartedRecord(),
    ]);
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(true);
  });

  it("returns false when no capture has started", async () => {
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(false);
  });

  it("returns false when no tab is watched even though the capture is left open", async () => {
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);

    expect(await isCapturing()).toBe(false);
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(retrieveAllEventRecords).mockResolvedValue(error);

    expect(await isCapturing()).toBe(error);
  });

  it("returns the error when the watched tabs cannot be determined", async () => {
    const error = new Error("targets failed");
    vi.mocked(retrieveAllEventRecords).mockResolvedValue([newCaptureStartedRecord()]);
    vi.mocked(getWatchedTabIds).mockResolvedValue(error);

    expect(await isCapturing()).toBe(error);
  });
});
