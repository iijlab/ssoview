/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";
import {
  getOngoingTracingSessionId,
  getTracedTabIds,
  isTracing,
} from "@/core/tracing/tracing-state-query.ts";
import {
  registerTabTracingTerminatedHandler,
  startTabTracing,
  stopTabTracing,
} from "@/service-worker/tab-tracing-controller.ts";
import {
  registerTracingTerminatedHandler,
  startTracing,
  stopTracing,
} from "./tracing-controller.ts";

vi.mock("@/core/tracing/tracing-event-repository.ts", () => ({
  saveTracingLifecycleEvent: vi.fn(),
}));

vi.mock("@/core/tracing/tracing-state-query.ts", () => ({
  getOngoingTracingSessionId: vi.fn(),
  getTracedTabIds: vi.fn(),
  isTracing: vi.fn(),
}));

vi.mock("@/service-worker/tab-tracing-controller.ts", () => ({
  registerTabTracingTerminatedHandler: vi.fn(),
  startTabTracing: vi.fn(),
  stopTabTracing: vi.fn(),
}));

//
// Helpers
//

type TabTracingTerminatedHandler = (tabId: number) => Promise<void>;
type TracingTerminatedHandler = (tabId: number) => Promise<void>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(undefined);
  vi.mocked(getOngoingTracingSessionId).mockResolvedValue(undefined);
  vi.mocked(getTracedTabIds).mockResolvedValue([]);
  vi.mocked(isTracing).mockResolvedValue(false);
  vi.mocked(startTabTracing).mockResolvedValue(undefined);
  vi.mocked(stopTabTracing).mockResolvedValue(undefined);
});

function registerAndGetHandler(
  onTracingTerminated: TracingTerminatedHandler,
): TabTracingTerminatedHandler {
  registerTracingTerminatedHandler(onTracingTerminated);
  const handler = vi.mocked(registerTabTracingTerminatedHandler).mock.calls[0]?.[0];
  if (handler === undefined) {
    throw new Error("No tab tracing terminated handler is registered");
  }
  return handler as TabTracingTerminatedHandler;
}

// Types of the events saved so far, in order
function savedEventTypes(): string[] {
  return vi.mocked(saveTracingLifecycleEvent).mock.calls.map(([event]) => event.type);
}

//
// Tests
//

describe("startTracing", () => {
  it("saves a TracingStarted event before starting tab tracing", async () => {
    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStarted" }),
    );
    expect(startTabTracing).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startTabTracing).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes tracing and returns the error when tab tracing cannot be started", async () => {
    const error = new Error("error");
    vi.mocked(startTabTracing).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(savedEventTypes()).toEqual(["TracingStarted", "TracingStopped"]);
  });

  it("does not start tab tracing when the event cannot be saved", async () => {
    const error = new Error("error");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(startTabTracing).not.toHaveBeenCalled();
  });

  it("closes stale tracing before starting anew", async () => {
    vi.mocked(getOngoingTracingSessionId).mockResolvedValue("tracing-session-1");

    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(savedEventTypes()).toEqual(["TracingStopped", "TracingStarted"]);
    expect(startTabTracing).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("does not start again while tracing is in progress", async () => {
    vi.mocked(getOngoingTracingSessionId).mockResolvedValue("tracing-session-1");
    vi.mocked(getTracedTabIds).mockResolvedValue([1]);
    vi.mocked(isTracing).mockResolvedValue(true);

    const result = await startTracing(1);

    expect(result).toBeUndefined();
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
    expect(startTabTracing).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalled();
  });

  it("does not start when the stale tracing cannot be closed", async () => {
    const error = new Error("error");
    vi.mocked(getOngoingTracingSessionId).mockResolvedValue("tracing-session-1");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await startTracing(1);

    expect(result).toBe(error);
    expect(startTabTracing).not.toHaveBeenCalled();
  });
});

describe("stopTracing", () => {
  it("saves a TracingStopped event after stopping tab tracing", async () => {
    const result = await stopTracing(1);

    expect(result).toBeUndefined();
    expect(stopTabTracing).toHaveBeenCalledExactlyOnceWith(1);
    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "TracingStopped" }),
    );
    expect(vi.mocked(stopTabTracing).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(saveTracingLifecycleEvent).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("saves nothing when tab tracing cannot be stopped", async () => {
    const error = new Error("error");
    vi.mocked(stopTabTracing).mockResolvedValue(error);

    const result = await stopTracing(1);

    expect(result).toBe(error);
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
  });

  it("returns an error when the event cannot be saved", async () => {
    const error = new Error("error");
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    const result = await stopTracing(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).cause).toBe(error);
  });
});

describe("registerTracingTerminatedHandler", () => {
  it("stops tracing and reports it when tab tracing stops", async () => {
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
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(new Error("error"));
    const onTracingTerminated = vi.fn();
    const handler = registerAndGetHandler(onTracingTerminated);

    await handler(1);

    expect(onTracingTerminated).toHaveBeenCalledExactlyOnceWith(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
