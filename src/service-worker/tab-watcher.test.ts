/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { newWatchStartedRecord, newWatchStoppedRecord } from "@/common/models/event-record.ts";
import { findAllEventRecords, saveEventRecord } from "@/common/services/event-store.ts";
import { tabExists } from "@/common/utils/chrome-tabs.ts";
import {
  isDebugging,
  registerDebuggerDetachHandler,
  startDebugging,
  stopDebugging,
} from "@/service-worker/debugger-controller.ts";
import {
  getWatchedTabIds,
  isWatching,
  registerWatchStopHandler,
  startWatching,
  stopWatching,
} from "./tab-watcher.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllEventRecords: vi.fn(),
  saveEventRecord: vi.fn(),
}));

vi.mock("@/common/utils/chrome-tabs.ts", () => ({
  tabExists: vi.fn(),
}));

vi.mock("@/service-worker/debugger-controller.ts", () => ({
  isDebugging: vi.fn(),
  registerDebuggerDetachHandler: vi.fn(),
  startDebugging: vi.fn(),
  stopDebugging: vi.fn(),
}));

//
// Helpers
//

type DebuggerDetachHandler = (tabId: number, reason: string) => Promise<void>;
type WatchStopHandler = (tabId: number) => Promise<void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(saveEventRecord).mockResolvedValue(undefined);
  vi.mocked(findAllEventRecords).mockResolvedValue([]);
  vi.mocked(isDebugging).mockResolvedValue(true);
  vi.mocked(startDebugging).mockResolvedValue(undefined);
  vi.mocked(stopDebugging).mockResolvedValue(undefined);
});

function registerAndGetHandler(onWatchStopped: WatchStopHandler): DebuggerDetachHandler {
  registerWatchStopHandler(onWatchStopped);
  const handler = vi.mocked(registerDebuggerDetachHandler).mock.calls[0]?.[0];
  if (handler === undefined) {
    throw new Error("No detach handler is registered");
  }
  return handler as DebuggerDetachHandler;
}

// Types of the event records stored so far, in order
function storedRecordTypes(): string[] {
  return vi.mocked(saveEventRecord).mock.calls.map(([record]) => record.type);
}

//
// Tests
//

describe("startWatching", () => {
  it("stores a WatchStarted record before starting debugging", async () => {
    const result = await startWatching(1);

    expect(result).toBeUndefined();
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "WatchStarted", tabId: 1 }),
    );
    expect(startDebugging).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveEventRecord).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startDebugging).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes the watch and returns the error when debugging cannot be started", async () => {
    const error = new Error("attach failed");
    vi.mocked(startDebugging).mockResolvedValue(error);

    const result = await startWatching(1);

    expect(result).toBe(error);
    expect(storedRecordTypes()).toEqual(["WatchStarted", "WatchStopped"]);
    expect(saveEventRecord).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "WatchStopped", tabId: 1 }),
    );
  });

  it("does not start debugging when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    const result = await startWatching(1);

    expect(result).toBe(error);
    expect(startDebugging).not.toHaveBeenCalled();
  });
});

describe("stopWatching", () => {
  it("stores a WatchStopped record after stopping debugging", async () => {
    const result = await stopWatching(1);

    expect(result).toBeUndefined();
    expect(stopDebugging).toHaveBeenCalledExactlyOnceWith(1);
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "WatchStopped", tabId: 1 }),
    );
    expect(vi.mocked(stopDebugging).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveEventRecord).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stores nothing when debugging cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopDebugging).mockResolvedValue(error);

    const result = await stopWatching(1);

    expect(result).toBe(error);
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("returns an error when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    const result = await stopWatching(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).cause).toBe(error);
  });
});

describe("registerWatchStopHandler", () => {
  it("stops the watch and reports it when the user cancels the debugger", async () => {
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "canceled_by_user");

    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "WatchStopped", tabId: 1 }),
    );
    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(startDebugging).not.toHaveBeenCalled();
  });

  it("keeps the watch by re-attaching when the tab still exists after target_closed", async () => {
    vi.mocked(tabExists).mockResolvedValue(true);
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "target_closed");

    expect(startDebugging).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(saveEventRecord).not.toHaveBeenCalled();
    expect(onWatchStopped).not.toHaveBeenCalled();
  });

  it("stops the watch and reports it when the tab is gone", async () => {
    vi.mocked(tabExists).mockResolvedValue(false);
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "target_closed");

    expect(startDebugging).not.toHaveBeenCalled();
    expect(storedRecordTypes()).toEqual(["WatchStopped"]);
    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("stops the watch and reports it when re-attaching fails", async () => {
    vi.mocked(tabExists).mockResolvedValue(true);
    vi.mocked(startDebugging).mockResolvedValue(new Error("attach failed"));
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "target_closed");

    expect(startDebugging).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(storedRecordTypes()).toEqual(["WatchStopped"]);
    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("reports the stop even when the record cannot be stored", async () => {
    vi.mocked(saveEventRecord).mockResolvedValue(new Error("storage failed"));
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "canceled_by_user");

    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("getWatchedTabIds", () => {
  it("returns the tabs whose watch has started and not stopped", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newWatchStartedRecord(2),
      newWatchStoppedRecord(1),
    ]);

    expect(await getWatchedTabIds()).toEqual([2]);
  });

  it("returns the tab when its watch started again after stopping", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newWatchStoppedRecord(1),
      newWatchStartedRecord(1),
    ]);

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("drops the tabs that are no longer debugged", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newWatchStartedRecord(2),
    ]);
    vi.mocked(isDebugging).mockImplementation(async (tabId) => tabId === 1);

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("returns an empty array when no watch has started", async () => {
    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await getWatchedTabIds()).toBe(error);
  });

  it("returns the error when the debugging state cannot be determined", async () => {
    const error = new Error("targets failed");
    vi.mocked(findAllEventRecords).mockResolvedValue([newWatchStartedRecord(1)]);
    vi.mocked(isDebugging).mockResolvedValue(error);

    expect(await getWatchedTabIds()).toBe(error);
  });
});

describe("isWatching", () => {
  it("returns true when the tab is watched", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newWatchStartedRecord(1)]);

    expect(await isWatching(1)).toBe(true);
  });

  it("returns false when another tab is watched", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newWatchStartedRecord(2)]);

    expect(await isWatching(1)).toBe(false);
  });

  it("returns the error when the watched tabs cannot be determined", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await isWatching(1)).toBe(error);
  });
});
