/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  newDebuggingStartedEvent,
  newDebuggingStoppedEvent,
  newTabTracingStartedEvent,
  newTabTracingStoppedEvent,
} from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import { getWatchedTabIds, isWatching } from "./watch-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllTracingLifecycleEvents: vi.fn(),
}));

//
// Helpers
//

const getTargets = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([]);
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
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
      newTabTracingStoppedEvent(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1, 2));

    expect(await getWatchedTabIds()).toEqual([2]);
  });

  it("returns the tab when its watch started again after stopping", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newTabTracingStoppedEvent(1),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("returns an empty array when no watch has started", async () => {
    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("drops the tabs that are no longer attached", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("drops the tab whose latest debugger event is a detach", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newDebuggingStoppedEvent(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("returns the tab that was attached again after a detach", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newDebuggingStoppedEvent(1),
      newDebuggingStartedEvent(1, true),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([1]);
  });

  it("drops the tab that no debugger event says was attached", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([newTabTracingStartedEvent(1)]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("ignores the debugger events of other tabs", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getWatchedTabIds()).toEqual([]);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getWatchedTabIds()).toBe(error);
  });

  it("returns an error when the debugger targets cannot be retrieved", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockRejectedValue(new Error("targets failed"));

    expect(await getWatchedTabIds()).toBeInstanceOf(Error);
  });
});

describe("isWatching", () => {
  it("returns true when the tab is watched", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isWatching(1)).toBe(true);
  });

  it("returns false when another tab is watched", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(2));

    expect(await isWatching(1)).toBe(false);
  });

  it("returns the error when the watched tabs cannot be determined", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await isWatching(1)).toBe(error);
  });
});
