/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type EventRecord,
  newArchiveImportedRecord,
  newCaptureStartedRecord,
  newCaptureStoppedRecord,
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
  newWatchStartedRecord,
  newWatchStoppedRecord,
} from "@/common/models/event-record.ts";
import { findAllEventRecords } from "@/common/services/event-store.ts";
import { getCaptureSession, getCaptureSessions } from "./capture-query.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllEventRecords: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findAllEventRecords).mockResolvedValue([]);
});

//
// Helpers
//

const factories = {
  CaptureStarted: newCaptureStartedRecord,
  CaptureStopped: newCaptureStoppedRecord,
  WatchStarted: () => newWatchStartedRecord(1),
  WatchStopped: () => newWatchStoppedRecord(1),
  DebuggerAttached: () => newDebuggerAttachedRecord(1, false),
  DebuggerDetached: () => newDebuggerDetachedRecord(1),
  ArchiveImported: newArchiveImportedRecord,
} satisfies Record<EventRecord["type"], () => EventRecord>;

function record(type: EventRecord["type"]): EventRecord {
  return factories[type]();
}

function mockRecords(...records: EventRecord[]): void {
  vi.mocked(findAllEventRecords).mockResolvedValue(records);
}

//
// Tests
//

describe("getCaptureSessions", () => {
  it("derives a session from a pair of capture records", async () => {
    const started = record("CaptureStarted");
    const stopped = record("CaptureStopped");
    mockRecords(started, stopped);

    expect(await getCaptureSessions()).toEqual([
      { id: started.id, imported: false, startedAt: started.date, endedAt: stopped.date },
    ]);
  });

  it("leaves out the end date while the capture is ongoing", async () => {
    const started = record("CaptureStarted");
    mockRecords(started);

    expect(await getCaptureSessions()).toEqual([
      { id: started.id, imported: false, startedAt: started.date },
    ]);
  });

  it("derives an imported session from an archive imported record", async () => {
    const imported = record("ArchiveImported");
    mockRecords(imported);

    expect(await getCaptureSessions()).toEqual([
      { id: imported.id, imported: true, importedAt: imported.date },
    ]);
  });

  it("returns the sessions in descending order of ID", async () => {
    const first = record("CaptureStarted");
    const imported = record("ArchiveImported");
    const stopped = record("CaptureStopped");
    mockRecords(first, imported, stopped);

    expect(await getCaptureSessions()).toEqual([
      { id: imported.id, imported: true, importedAt: imported.date },
      { id: first.id, imported: false, startedAt: first.date, endedAt: stopped.date },
    ]);
  });

  it("ignores a stop record without a capture in progress", async () => {
    mockRecords(record("CaptureStopped"));

    expect(await getCaptureSessions()).toEqual([]);
  });

  it("closes the previous capture when another one starts", async () => {
    const first = record("CaptureStarted");
    const second = record("CaptureStarted");
    mockRecords(first, second);

    expect(await getCaptureSessions()).toEqual([
      { id: second.id, imported: false, startedAt: second.date },
      { id: first.id, imported: false, startedAt: first.date },
    ]);
  });

  it("ignores the records of the other layers", async () => {
    const started = record("CaptureStarted");
    mockRecords(
      started,
      record("WatchStarted"),
      record("DebuggerAttached"),
      record("DebuggerDetached"),
      record("WatchStopped"),
    );

    expect(await getCaptureSessions()).toEqual([
      { id: started.id, imported: false, startedAt: started.date },
    ]);
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await getCaptureSessions()).toBe(error);
  });
});

describe("getCaptureSession", () => {
  it("returns the imported session with the given ID", async () => {
    const started = record("CaptureStarted");
    const imported = record("ArchiveImported");
    mockRecords(started, imported);

    expect(await getCaptureSession(imported.id)).toEqual({
      id: imported.id,
      imported: true,
      importedAt: imported.date,
    });
  });

  it("returns the captured session with the given ID", async () => {
    const started = record("CaptureStarted");
    const imported = record("ArchiveImported");
    mockRecords(started, imported);

    expect(await getCaptureSession(started.id)).toEqual({
      id: started.id,
      imported: false,
      startedAt: started.date,
    });
  });

  it("returns undefined for an unknown ID", async () => {
    mockRecords(record("ArchiveImported"));

    expect(await getCaptureSession("unknown")).toBeUndefined();
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await getCaptureSession("unknown")).toBe(error);
  });
});
