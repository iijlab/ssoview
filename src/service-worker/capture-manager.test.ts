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
import { registerCaptureStopHandler, startCapturing, stopCapturing } from "./capture-manager.ts";

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
type CaptureStopHandler = (tabId: number) => Promise<void>;

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

function registerAndGetHandler(onCaptureStopped: CaptureStopHandler): WatchStopHandler {
  registerCaptureStopHandler(onCaptureStopped);
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

// Types of the events stored so far, in order
function storedEventTypes(): string[] {
  return vi.mocked(saveTracingLifecycleEvent).mock.calls.map(([event]) => event.type);
}

//
// Tests
//

describe("startCapturing", () => {
  it("stores a TracingStarted event before starting the watch", async () => {
    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStarted" }),
    );
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startWatching).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes the capture and returns the error when the watch cannot be started", async () => {
    const error = new Error("watch failed");
    vi.mocked(startWatching).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(storedEventTypes()).toEqual(["TracingStarted", "TracingStopped"]);
  });

  it("does not start the watch when the event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });

  it("closes an inconsistent capture before starting a new one", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(storedEventTypes()).toEqual(["TracingStopped", "TracingStarted"]);
    expect(startWatching).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not start another capture while one is in progress", async () => {
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    const result = await startCapturing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
    expect(startWatching).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("does not start when the inconsistent capture cannot be closed", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(tracingEvents("TracingStarted"));
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startCapturing(1);

    expect(result).toBe(error);
    expect(startWatching).not.toHaveBeenCalled();
  });
});

describe("stopCapturing", () => {
  it("stores a TracingStopped event after stopping the watch", async () => {
    const result = await stopCapturing(1);

    expect(result).toBeUndefined();
    expect(stopWatching).toHaveBeenCalledExactlyOnceWith(1);
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStopped" }),
    );
    expect(vi.mocked(stopWatching).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stores nothing when the watch cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopWatching).mockResolvedValue(error);

    const result = await stopCapturing(1);

    expect(result).toBe(error);
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

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

    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStopped" }),
    );
    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      onCaptureStopped.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reports the stop even when the event cannot be stored", async () => {
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(new Error("storage failed"));
    const onCaptureStopped = vi.fn();
    const handler = registerAndGetHandler(onCaptureStopped);

    await handler(1);

    expect(onCaptureStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
