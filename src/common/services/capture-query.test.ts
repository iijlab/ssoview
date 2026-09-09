/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TracingLifecycleEvent,
  newArchiveImportedEvent,
  newDebuggingStartedEvent,
  newDebuggingStoppedEvent,
  newTabTracingStartedEvent,
  newTabTracingStoppedEvent,
  newTracingStartedEvent,
  newTracingStoppedEvent,
} from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";
import {
  getOngoingTracingSessionId,
  getTracingSession,
  getTracingSessions,
  isCapturing,
} from "./capture-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllTracingLifecycleEvents: vi.fn(),
}));

vi.mock("@/common/services/watch-query.ts", () => ({
  getWatchedTabIds: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([]);
  vi.mocked(getWatchedTabIds).mockResolvedValue([]);
});

//
// Helpers
//

const factories = {
  TracingStarted: newTracingStartedEvent,
  TracingStopped: newTracingStoppedEvent,
  TabTracingStarted: () => newTabTracingStartedEvent(1),
  TabTracingStopped: () => newTabTracingStoppedEvent(1),
  DebuggingStarted: () => newDebuggingStartedEvent(1, false),
  DebuggingStopped: () => newDebuggingStoppedEvent(1),
  ArchiveImported: newArchiveImportedEvent,
} satisfies Record<TracingLifecycleEvent["type"], () => TracingLifecycleEvent>;

function event(type: TracingLifecycleEvent["type"]): TracingLifecycleEvent {
  return factories[type]();
}

function mockEvents(...events: TracingLifecycleEvent[]): void {
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(events);
}

function tracingEvents(...types: ("TracingStarted" | "TracingStopped")[]): TracingLifecycleEvent[] {
  return types.map(event);
}

//
// Tests
//

describe("getTracingSessions", () => {
  it("derives a session from a pair of capture events", async () => {
    const started = event("TracingStarted");
    const stopped = event("TracingStopped");
    mockEvents(started, stopped);

    expect(await getTracingSessions()).toEqual([
      {
        id: started.id,
        imported: false,
        startedAt: started.recordedAt,
        endedAt: stopped.recordedAt,
      },
    ]);
  });

  it("leaves out the end date while the capture is ongoing", async () => {
    const started = event("TracingStarted");
    mockEvents(started);

    expect(await getTracingSessions()).toEqual([
      { id: started.id, imported: false, startedAt: started.recordedAt },
    ]);
  });

  it("derives an imported session from an archive imported event", async () => {
    const imported = event("ArchiveImported");
    mockEvents(imported);

    expect(await getTracingSessions()).toEqual([
      { id: imported.id, imported: true, importedAt: imported.recordedAt },
    ]);
  });

  it("returns the sessions in descending order of ID", async () => {
    const first = event("TracingStarted");
    const imported = event("ArchiveImported");
    const stopped = event("TracingStopped");
    mockEvents(first, imported, stopped);

    expect(await getTracingSessions()).toEqual([
      { id: imported.id, imported: true, importedAt: imported.recordedAt },
      { id: first.id, imported: false, startedAt: first.recordedAt, endedAt: stopped.recordedAt },
    ]);
  });

  it("ignores a stop event without a capture in progress", async () => {
    mockEvents(event("TracingStopped"));

    expect(await getTracingSessions()).toEqual([]);
  });

  it("closes the previous capture when another one starts", async () => {
    const first = event("TracingStarted");
    const second = event("TracingStarted");
    mockEvents(first, second);

    expect(await getTracingSessions()).toEqual([
      { id: second.id, imported: false, startedAt: second.recordedAt },
      { id: first.id, imported: false, startedAt: first.recordedAt },
    ]);
  });

  it("ignores the events of the other layers", async () => {
    const started = event("TracingStarted");
    mockEvents(
      started,
      event("TabTracingStarted"),
      event("DebuggingStarted"),
      event("DebuggingStopped"),
      event("TabTracingStopped"),
    );

    expect(await getTracingSessions()).toEqual([
      { id: started.id, imported: false, startedAt: started.recordedAt },
    ]);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getTracingSessions()).toBe(error);
  });
});

describe("getTracingSession", () => {
  it("returns the imported session with the given ID", async () => {
    const started = event("TracingStarted");
    const imported = event("ArchiveImported");
    mockEvents(started, imported);

    expect(await getTracingSession(imported.id)).toEqual({
      id: imported.id,
      imported: true,
      importedAt: imported.recordedAt,
    });
  });

  it("returns the tracing session with the given ID", async () => {
    const started = event("TracingStarted");
    const imported = event("ArchiveImported");
    mockEvents(started, imported);

    expect(await getTracingSession(started.id)).toEqual({
      id: started.id,
      imported: false,
      startedAt: started.recordedAt,
    });
  });

  it("returns undefined for an unknown ID", async () => {
    mockEvents(event("ArchiveImported"));

    expect(await getTracingSession("unknown")).toBeUndefined();
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getTracingSession("unknown")).toBe(error);
  });
});

describe("getOngoingTracingSessionId", () => {
  it("returns the ID of the event that started the ongoing capture", async () => {
    const events = tracingEvents("TracingStarted", "TracingStopped", "TracingStarted");
    mockEvents(...events);

    expect(await getOngoingTracingSessionId()).toBe(events[2]?.id);
    expect(getWatchedTabIds).not.toHaveBeenCalled();
  });

  it("ignores events other than capture events", async () => {
    const started = event("TracingStarted");
    mockEvents(started, event("TabTracingStarted"));

    expect(await getOngoingTracingSessionId()).toBe(started.id);
  });

  it("returns undefined when the latest capture has stopped", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped"));

    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns undefined when no capture has started", async () => {
    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getOngoingTracingSessionId()).toBe(error);
  });
});

describe("isCapturing", () => {
  it("returns true when a capture has started and a tab is still watched", async () => {
    mockEvents(...tracingEvents("TracingStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(true);
  });

  it("returns false when the latest capture has stopped", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(false);
    expect(getWatchedTabIds).not.toHaveBeenCalled();
  });

  it("returns true when a capture has started again after stopping", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped", "TracingStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(true);
  });

  it("returns false when no capture has started", async () => {
    vi.mocked(getWatchedTabIds).mockResolvedValue([1]);

    expect(await isCapturing()).toBe(false);
  });

  it("returns false when no tab is watched even though the capture is left open", async () => {
    mockEvents(...tracingEvents("TracingStarted"));

    expect(await isCapturing()).toBe(false);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await isCapturing()).toBe(error);
  });

  it("returns the error when the watched tabs cannot be determined", async () => {
    const error = new Error("targets failed");
    mockEvents(...tracingEvents("TracingStarted"));
    vi.mocked(getWatchedTabIds).mockResolvedValue(error);

    expect(await isCapturing()).toBe(error);
  });
});
