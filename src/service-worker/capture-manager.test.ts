/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TracingLifecycleEvent,
  newTracingStartedEvent,
  newTracingStoppedEvent,
} from "@/common/models/event-record.ts";
import {
  findAllTracingLifecycleEvents,
  saveTracingLifecycleEvent,
} from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";
import {
  registerWatchStopHandler,
  startWatching,
  stopWatching,
} from "@/service-worker/tab-watcher.ts";
import { registerTracingTerminatedHandler, startTracing, stopTracing } from "./capture-manager.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllTracingLifecycleEvents: vi.fn(),
  saveTracingLifecycleEvent: vi.fn(),
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
type TracingTerminatedHandler = (tabId: number) => Promise<void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(undefined);
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([]);
  vi.mocked(getWatchedTabIds).mockResolvedValue([]);
  vi.mocked(startWatching).mockResolvedValue(undefined);
  vi.mocked(stopWatching).mockResolvedValue(undefined);
});

function registerAndGetHandler(onTracingTerminated: TracingTerminatedHandler): WatchStopHandler {
  registerTracingTerminatedHandler(onTracingTerminated);
  const handler = vi.mocked(registerWatchStopHandler).mock.calls[0]?.[0];
  if (handler === undefined) {
    throw new Error("No watch stop handler is registered");
  }
  return handler as WatchStopHandler;
}

function tracingEvents(...types: ("TracingStarted" | "TracingStopped")[]): TracingLifecycleEvent[] {
  return types.map((type) =>
    type === "TracingStarted" ? newTracingStartedEvent() : newTracingStoppedEvent(),
  );
}

// Types of the events saved so far, in order
function savedEventTypes(): string[] {
  return vi.mocked(saveTracingLifecycleEvent).mock.calls.map(([event]) => event.type);
}

//
// Tests
//

describe("startTracing", () => {
  it("saves a TracingStarted event before starting the watch", async () => {
    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStarted" }),
    );
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startWatching).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes the tracing and returns the error when the watch cannot be started", async () => {
    const error = new Error("watch failed");
    vi.mocked(startWatching).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(savedEventTypes()).toEqual(["TracingStarted", "TracingStopped"]);
  });

  it("does not start the watch when the event cannot be saved", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });

  it("closes stale tracing before starting anew", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));

    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(savedEventTypes()).toEqual(["TracingStopped", "TracingStarted"]);
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not start again while tracing is in progress", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
    expect(startWatching).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("does not start when the stale tracing cannot be closed", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });
});

describe("stopTracing", () => {
  it("saves a TracingStopped event after stopping the watch", async () => {
    const result = await stopTracing(1);

    expect(result).toBeUndefined();
    expect(stopWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStopped" }),
    );
    expect(vi.mocked(stopWatching).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("saves nothing when the watch cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopWatching).mockResolvedValue(error);

    const result = await stopTracing(1);

    expect(result).toBe(error);
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the event cannot be saved", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await stopTracing(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).cause).toBe(error);
  });
});

describe("registerTracingTerminatedHandler", () => {
  it("stops the tracing and reports it when the watch stops", async () => {
    const onTracingTerminated = vi.fn();
    const handler = registerAndGetHandler(onTracingTerminated);

    await handler(1);

    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStopped" }),
    );
    expect(onTracingTerminated).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      onTracingTerminated.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reports the stop even when the event cannot be saved", async () => {
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(new Error("storage failed"));
    const onTracingTerminated = vi.fn();
    const handler = registerAndGetHandler(onTracingTerminated);

    await handler(1);

    expect(onTracingTerminated).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
