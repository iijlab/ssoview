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
import { getTracingSession, getTracingSessions } from "./capture-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllTracingLifecycleEvents: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue([]);
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

//
// Tests
//

describe("getTracingSessions", () => {
  it("derives a tracing session from a pair of tracing events", async () => {
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

  it("derives an imported tracing session from an archive imported event", async () => {
    const imported = event("ArchiveImported");
    mockEvents(imported);

    expect(await getTracingSessions()).toEqual([
      { id: imported.id, imported: true, importedAt: imported.recordedAt },
    ]);
  });

  it("returns the tracing sessions in descending order of ID", async () => {
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
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getTracingSessions()).toBe(error);
  });
});

describe("getTracingSession", () => {
  it("returns the imported tracing session with the given ID", async () => {
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
    const error = new Error("error");
    vi.mocked(findAllTracingLifecycleEvents).mockResolvedValue(error);

    expect(await getTracingSession("unknown")).toBe(error);
  });
});
