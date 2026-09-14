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
  newTracingStartedEvent,
  newTracingStoppedEvent,
} from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import {
  getOngoingTracingSessionId,
  getTracedTabIds,
  isTracedTab,
  isTracing,
} from "./watch-query.ts";

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

describe("isTracing", () => {
  it("returns true when tracing has started and a tab is still traced", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isTracing()).toBe(true);
  });

  it("returns false when the latest tracing has stopped", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newTracingStoppedEvent(),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isTracing()).toBe(false);
    expect(getTargets).not.toHaveBeenCalled();
  });

  it("returns true when tracing has started again after stopping", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTracingStoppedEvent(),
      newTracingStartedEvent(),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isTracing()).toBe(true);
  });

  it("returns false when no tracing has started", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isTracing()).toBe(false);
    expect(getTargets).not.toHaveBeenCalled();
  });

  it("returns false when no tab is traced even though tracing is left open", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([newTracingStartedEvent()]);

    expect(await isTracing()).toBe(false);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await isTracing()).toBe(error);
  });

  it("returns an error when the debugger targets cannot be retrieved", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockRejectedValue(new Error("error"));

    expect(await isTracing()).toBeInstanceOf(Error);
  });
});

describe("getOngoingTracingSessionId", () => {
  it("returns the ID of the event that started the ongoing tracing", async () => {
    const started = newTracingStartedEvent();
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTracingStoppedEvent(),
      started,
    ]);

    expect(await getOngoingTracingSessionId()).toBe(started.id);
  });

  it("ignores events other than tracing events", async () => {
    const started = newTracingStartedEvent();
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      started,
      newTabTracingStartedEvent(1),
    ]);

    expect(await getOngoingTracingSessionId()).toBe(started.id);
  });

  it("returns undefined when the latest tracing has stopped", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTracingStartedEvent(),
      newTracingStoppedEvent(),
    ]);

    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns undefined when no tracing has started", async () => {
    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getOngoingTracingSessionId()).toBe(error);
  });
});

describe("getTracedTabIds", () => {
  it("returns the tabs whose tracing has started and not stopped", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
      newTabTracingStoppedEvent(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1, 2));

    expect(await getTracedTabIds()).toEqual([2]);
  });

  it("returns the tab when its tracing started again after stopping", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newTabTracingStoppedEvent(1),
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([1]);
  });

  it("returns an empty array when no tab tracing has started", async () => {
    expect(await getTracedTabIds()).toEqual([]);
  });

  it("drops the tabs that are no longer attached", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([1]);
  });

  it("drops the tab whose latest debugging event is a stop", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newDebuggingStoppedEvent(1),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([]);
  });

  it("returns the tab whose debugging started again after a stop", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
      newDebuggingStoppedEvent(1),
      newDebuggingStartedEvent(1, true),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([1]);
  });

  it("drops the tab that no debugging event says was started", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([newTabTracingStartedEvent(1)]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([]);
  });

  it("ignores the debugging events of other tabs", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await getTracedTabIds()).toEqual([]);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getTracedTabIds()).toBe(error);
  });

  it("returns an error when the debugger targets cannot be retrieved", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockRejectedValue(new Error("error"));

    expect(await getTracedTabIds()).toBeInstanceOf(Error);
  });
});

describe("isTracedTab", () => {
  it("returns true when the tab is traced", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(1),
      newDebuggingStartedEvent(1, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(1));

    expect(await isTracedTab(1)).toBe(true);
  });

  it("returns false when another tab is traced", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([
      newTabTracingStartedEvent(2),
      newDebuggingStartedEvent(2, false),
    ]);
    getTargets.mockResolvedValue(attachedTargets(2));

    expect(await isTracedTab(1)).toBe(false);
  });

  it("returns the error when the traced tabs cannot be determined", async () => {
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await isTracedTab(1)).toBe(error);
  });
});
