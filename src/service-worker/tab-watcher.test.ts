/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveTracingLifecycleEvent } from "@/common/services/event-store.ts";
import { tabExists } from "@/common/utils/chrome-tabs.ts";
import {
  registerDebuggerDetachHandler,
  startDebugging,
  stopDebugging,
} from "@/service-worker/debugger-controller.ts";
import { registerWatchStopHandler, startWatching, stopWatching } from "./tab-watcher.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  saveTracingLifecycleEvent: vi.fn(),
}));

vi.mock("@/common/utils/chrome-tabs.ts", () => ({
  tabExists: vi.fn(),
}));

vi.mock("@/service-worker/debugger-controller.ts", () => ({
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
  vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(undefined);
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

// Types of the events stored so far, in order
function storedEventTypes(): string[] {
  return vi.mocked(saveTracingLifecycleEvent).mock.calls.map(([event]) => event.type);
}

//
// Tests
//

describe("startWatching", () => {
  it("stores a TabTracingStarted event before starting debugging", async () => {
    const result = await startWatching(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TabTracingStarted", tabId: 1 }),
    );
    expect(startDebugging).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startDebugging).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes the watch and returns the error when debugging cannot be started", async () => {
    const error = new Error("attach failed");
    vi.mocked(startDebugging).mockResolvedValue(error);

    const result = await startWatching(1);

    expect(result).toBe(error);
    expect(storedEventTypes()).toEqual(["TabTracingStarted", "TabTracingStopped"]);
    expect(saveTracingLifecycleEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "TabTracingStopped", tabId: 1 }),
    );
  });

  it("does not start debugging when the event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startWatching(1);

    expect(result).toBe(error);
    expect(startDebugging).not.toHaveBeenCalled();
  });
});

describe("stopWatching", () => {
  it("stores a TabTracingStopped event after stopping debugging", async () => {
    const result = await stopWatching(1);

    expect(result).toBeUndefined();
    expect(stopDebugging).toHaveBeenCalledExactlyOnceWith(1);
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TabTracingStopped", tabId: 1 }),
    );
    expect(vi.mocked(stopDebugging).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("stores nothing when debugging cannot be stopped", async () => {
    const error = new Error("detach failed");
    vi.mocked(stopDebugging).mockResolvedValue(error);

    const result = await stopWatching(1);

    expect(result).toBe(error);
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

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

    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TabTracingStopped", tabId: 1 }),
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
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
    expect(onWatchStopped).not.toHaveBeenCalled();
  });

  it("stops the watch and reports it when the tab is gone", async () => {
    vi.mocked(tabExists).mockResolvedValue(false);
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "target_closed");

    expect(startDebugging).not.toHaveBeenCalled();
    expect(storedEventTypes()).toEqual(["TabTracingStopped"]);
    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("stops the watch and reports it when re-attaching fails", async () => {
    vi.mocked(tabExists).mockResolvedValue(true);
    vi.mocked(startDebugging).mockResolvedValue(new Error("attach failed"));
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "target_closed");

    expect(startDebugging).toHaveBeenCalledExactlyOnceWith(1, true);
    expect(storedEventTypes()).toEqual(["TabTracingStopped"]);
    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("reports the stop even when the event cannot be stored", async () => {
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(new Error("storage failed"));
    const onWatchStopped = vi.fn();
    const handler = registerAndGetHandler(onWatchStopped);

    await handler(1, "canceled_by_user");

    expect(onWatchStopped).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
