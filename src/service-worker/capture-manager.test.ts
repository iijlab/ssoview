/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EventRecord,
  newCaptureStartedRecord,
  newCaptureStoppedRecord,
} from "@/common/models/event-record.ts";
import { findAllEventRecords, saveEventRecord } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";
import {
  registerWatchStopHandler,
  startWatching,
  stopWatching,
} from "@/service-worker/tab-watcher.ts";
import { registerCaptureStopHandler, startCapturing, stopCapturing } from "./capture-manager.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllEventRecords: vi.fn(),
  saveEventRecord: vi.fn(),
}));

vi.mock("@/common/services/watch-query.ts", () => ({
  getWatchedTabIds: vi.fn(),
}));

vi.mock("@/service-worker/tab-watcher.ts", () => ({
  registerWatchStopHandler: vi.fn(),
  startWatching: vi.fn(),
  stopWatching: vi.fn(),
}));

//
// Helpers
//

type WatchStopHandler = (tabId: number) => Promise<void>;
type CaptureStopHandler = (tabId: number) => Promise<void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(saveEventRecord).mockResolvedValue(undefined);
  vi.mocked(findAllEventRecords).mockResolvedValue([]);
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

function captureRecords(...types: ("CaptureStarted" | "CaptureStopped")[]): EventRecord[] {
  return types.map((type) =>
    type === "CaptureStarted" ? newCaptureStartedRecord() : newCaptureStoppedRecord(),
  );
}

// Types of the event records stored so far, in order
function storedRecordTypes(): string[] {
  return vi.mocked(saveEventRecord).mock.calls.map(([record]) => record.type);
}

//
// Tests
//

describe("startCapturing", () => {
  it("stores a CaptureStarted record before starting the watch", async () => {
    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStarted" }),
    );
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveEventRecord).mock.invocationCallOrder[0]).toBeLessThan(
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
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });

  it("closes an inconsistent capture before starting a new one", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue(captureRecords("CaptureStarted"));

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(storedRecordTypes()).toEqual(["CaptureStopped", "CaptureStarted"]);
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not start another capture while one is in progress", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue(captureRecords("CaptureStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(saveEventRecord).not.toHaveBeenCalled();
    expect(startWatching).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("does not start when the inconsistent capture cannot be closed", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(captureRecords("CaptureStarted"));
    vi.mocked(saveEventRecord).mockResolvedValue(error);

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
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStopped" }),
    );
    expect(vi.mocked(stopWatching).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveEventRecord).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stores nothing when the watch cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopWatching).mockResolvedValue(error);

    const result = await stopCapturing(1);

    expect(result).toBe(error);
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("returns an error when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveEventRecord).mockResolvedValue(error);

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

    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "CaptureStopped" }),
    );
    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveEventRecord).mock.invocationCallOrder[0]).toBeLessThan(
      onCaptureStopped.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reports the stop even when the record cannot be stored", async () => {
    vi.mocked(saveEventRecord).mockResolvedValue(new Error("storage failed"));
    const onCaptureStopped = vi.fn();
    const handler = registerAndGetHandler(onCaptureStopped);

    await handler(1);

    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
