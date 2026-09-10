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
import { getTracedTabIds } from "@/common/services/watch-query.ts";
import {
  getOngoingTracingSessionId,
  getTracingSession,
  getTracingSessions,
  isTracing,
} from "./capture-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllTracingLifecycleEvents: vi.fn(),
}));

vi.mock("@/common/services/watch-query.ts", () => ({
  getTracedTabIds: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([]);
  vi.mocked(getTracedTabIds).mockResolvedValue([]);
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
  it("derives a session from a pair of tracing events", async () => {
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

  it("leaves out the end date while tracing is ongoing", async () => {
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

  it("ignores a stop event while tracing is not in progress", async () => {
    mockEvents(event("TracingStopped"));

    expect(await getTracingSessions()).toEqual([]);
  });

  it("closes the previous tracing session when another one starts", async () => {
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
  it("returns the ID of the event that started the ongoing tracing", async () => {
    const events = tracingEvents("TracingStarted", "TracingStopped", "TracingStarted");
    mockEvents(...events);

    expect(await getOngoingTracingSessionId()).toBe(events[2]?.id);
    expect(getTracedTabIds).not.toHaveBeenCalled();
  });

  it("ignores events other than tracing events", async () => {
    const started = event("TracingStarted");
    mockEvents(started, event("TabTracingStarted"));

    expect(await getOngoingTracingSessionId()).toBe(started.id);
  });

  it("returns undefined when the latest tracing has stopped", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped"));

    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns undefined when no tracing has started", async () => {
    expect(await getOngoingTracingSessionId()).toBeUndefined();
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getOngoingTracingSessionId()).toBe(error);
  });
});

describe("isTracing", () => {
  it("returns true when tracing has started and a tab is still traced", async () => {
    mockEvents(...tracingEvents("TracingStarted"));
    vi.mocked(getTracedTabIds).mockResolvedValue([1]);

    expect(await isTracing()).toBe(true);
  });

  it("returns false when the latest tracing has stopped", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped"));
    vi.mocked(getTracedTabIds).mockResolvedValue([1]);

    expect(await isTracing()).toBe(false);
    expect(getTracedTabIds).not.toHaveBeenCalled();
  });

  it("returns true when tracing has started again after stopping", async () => {
    mockEvents(...tracingEvents("TracingStarted", "TracingStopped", "TracingStarted"));
    vi.mocked(getTracedTabIds).mockResolvedValue([1]);

    expect(await isTracing()).toBe(true);
  });

  it("returns false when no tracing has started", async () => {
    vi.mocked(getTracedTabIds).mockResolvedValue([1]);

    expect(await isTracing()).toBe(false);
  });

  it("returns false when no tab is traced even though tracing is left open", async () => {
    mockEvents(...tracingEvents("TracingStarted"));

    expect(await isTracing()).toBe(false);
  });

  it("returns the error when the events cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await isTracing()).toBe(error);
  });

  it("returns the error when the traced tabs cannot be determined", async () => {
    const error = new Error("targets failed");
    mockEvents(...tracingEvents("TracingStarted"));
    vi.mocked(getTracedTabIds).mockResolvedValue(error);

    expect(await isTracing()).toBe(error);
  });
});
