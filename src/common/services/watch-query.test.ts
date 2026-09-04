/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
  newWatchStartedRecord,
  newWatchStoppedRecord,
} from "@/common/models/event-record.ts";
import { findAllEventRecords } from "@/common/services/event-store.ts";
import { getWatchedTabIds, isWatching } from "./watch-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllEventRecords: vi.fn(),
}));

//
// Helpers
//

const getTargets = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllEventRecords).mockResolvedValue([]);
  getTargets.mockResolvedValue([]);
  vi.stubGlobal("chrome", { debugger: { getTargets } });
});

function attachedTargets(...tabIds: number[]) {
  return tabIds.map((tabId) => ({ tabId, attached: true }));
}

//
// Tests
//

describe("getWatchedTabIds", () => {
  it("returns the tabs whose watch has started and not stopped", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
      newWatchStartedRecord(2),
      newDebuggerAttachedRecord(2, false),
      newWatchStoppedRecord(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1, 2));

    expect(await getWatchedTabIds()).toEqual([2]);
  });

  it("returns the tab when its watch started again after stopping", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newWatchStoppedRecord(1),
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("returns an empty array when no watch has started", async () => {
    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("drops the tabs that are no longer attached", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
      newWatchStartedRecord(2),
      newDebuggerAttachedRecord(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("drops the tab whose latest debugger record is a detach", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
      newDebuggerDetachedRecord(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("returns the tab that was attached again after a detach", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
      newDebuggerDetachedRecord(1),
      newDebuggerAttachedRecord(1, true),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("drops the tab that no debugger record says was attached", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newWatchStartedRecord(1)]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("ignores the debugger records of other tabs", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await getWatchedTabIds()).toBe(error);
  });

  it("returns an error when the debugger targets cannot be retrieved", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
    ]);
    getTargets.mockRejectedValue(new Error("targets failed"));

    expect(await getWatchedTabIds()).toBeInstanceOf(Error);
  });
});

describe("isWatching", () => {
  it("returns true when the tab is watched", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(1),
      newDebuggerAttachedRecord(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isWatching(1)).toBe(true);
  });

  it("returns false when another tab is watched", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newWatchStartedRecord(2),
      newDebuggerAttachedRecord(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(2));

    expect(await isWatching(1)).toBe(false);
  });

  it("returns the error when the watched tabs cannot be determined", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await isWatching(1)).toBe(error);
  });
});
