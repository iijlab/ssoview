/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { describe, expect, it } from "vitest";
import {
  isEventRecord,
  isEventRecordType,
  newArchiveImportedRecord,
  newCaptureStartedRecord,
  newCaptureStoppedRecord,
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
  newWatchStartedRecord,
  newWatchStoppedRecord,
} from "./event-record.ts";

describe("factory functions", () => {
  it("creates a CaptureStartedRecord", () => {
    const record = newCaptureStartedRecord();
    expect(record.type).toBe("CaptureStarted");
  });

  it("creates a CaptureStoppedRecord", () => {
    const record = newCaptureStoppedRecord();
    expect(record.type).toBe("CaptureStopped");
  });

  it("creates a WatchStartedRecord with the tab ID", () => {
    const record = newWatchStartedRecord(42);
    expect(record.type).toBe("WatchStarted");
    expect(record.tabId).toBe(42);
  });

  it("creates a WatchStoppedRecord with the tab ID", () => {
    const record = newWatchStoppedRecord(42);
    expect(record.type).toBe("WatchStopped");
    expect(record.tabId).toBe(42);
  });

  it("creates a DebuggerAttachedRecord with the tab ID and retry flag", () => {
    const record = newDebuggerAttachedRecord(42, true);
    expect(record.type).toBe("DebuggerAttached");
    expect(record.tabId).toBe(42);
    expect(record.retry).toBe(true);
  });

  it("creates a DebuggerDetachedRecord detached by self when no reason is given", () => {
    const record = newDebuggerDetachedRecord(42);
    expect(record.type).toBe("DebuggerDetached");
    expect(record.tabId).toBe(42);
    expect(record.detachedBy).toBe("self");
    expect(record).not.toHaveProperty("detachReason");
  });

  it("creates a DebuggerDetachedRecord detached by Chrome when a reason is given", () => {
    const record = newDebuggerDetachedRecord(42, "target_closed");
    expect(record.type).toBe("DebuggerDetached");
    expect(record.tabId).toBe(42);
    expect(record.detachedBy).toBe("chrome");
    expect(record).toHaveProperty("detachReason", "target_closed");
  });

  it("creates an ArchiveImportedRecord", () => {
    const record = newArchiveImportedRecord();
    expect(record.type).toBe("ArchiveImported");
  });

  it("assigns a UUIDv7 as the ID", () => {
    const record = newCaptureStartedRecord();
    expect(uuidValidate(record.id)).toBe(true);
    expect(uuidVersion(record.id)).toBe(7);
  });

  it("assigns an ISO 8601 date", () => {
    const record = newCaptureStartedRecord();
    expect(new Date(record.date).toISOString()).toBe(record.date);
  });

  it("assigns IDs that sort in generation order", () => {
    const ids = [
      newCaptureStartedRecord().id,
      newWatchStartedRecord(1).id,
      newDebuggerAttachedRecord(1, false).id,
      newDebuggerDetachedRecord(1, "canceled_by_user").id,
      newWatchStoppedRecord(1).id,
      newCaptureStoppedRecord().id,
      newArchiveImportedRecord().id,
    ];
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("isEventRecord", () => {
  it("returns true for every record the factories create", () => {
    expect(isEventRecord(newCaptureStartedRecord())).toBe(true);
    expect(isEventRecord(newCaptureStoppedRecord())).toBe(true);
    expect(isEventRecord(newWatchStartedRecord(1))).toBe(true);
    expect(isEventRecord(newWatchStoppedRecord(1))).toBe(true);
    expect(isEventRecord(newDebuggerAttachedRecord(1, false))).toBe(true);
    expect(isEventRecord(newDebuggerDetachedRecord(1))).toBe(true);
    expect(isEventRecord(newDebuggerDetachedRecord(1, "target_closed"))).toBe(true);
    expect(isEventRecord(newArchiveImportedRecord())).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isEventRecord(null)).toBe(false);
    expect(isEventRecord(undefined)).toBe(false);
    expect(isEventRecord("CaptureStarted")).toBe(false);
    expect(isEventRecord(42)).toBe(false);
  });

  it("returns false for an object without a type", () => {
    const { type: _, ...rest } = newCaptureStartedRecord();
    expect(isEventRecord(rest)).toBe(false);
  });

  it("returns false for an unknown type", () => {
    const record = { ...newCaptureStartedRecord(), type: "TabClosed" };
    expect(isEventRecord(record)).toBe(false);
  });

  it("returns false when the ID is missing", () => {
    const { id: _, ...rest } = newCaptureStartedRecord();
    expect(isEventRecord(rest)).toBe(false);
  });

  it("returns false when the date is missing", () => {
    const { date: _, ...rest } = newCaptureStartedRecord();
    expect(isEventRecord(rest)).toBe(false);
  });

  it("returns false when a tab-scoped record has no tab ID", () => {
    const { tabId: _, ...rest } = newWatchStartedRecord(1);
    expect(isEventRecord(rest)).toBe(false);
  });

  it("returns false when a DebuggerAttachedRecord has no retry flag", () => {
    const { retry: _, ...rest } = newDebuggerAttachedRecord(1, false);
    expect(isEventRecord(rest)).toBe(false);
  });

  it("returns false when a DebuggerDetachedRecord has an unknown detachedBy", () => {
    const record = { ...newDebuggerDetachedRecord(1), detachedBy: "user" };
    expect(isEventRecord(record)).toBe(false);
  });

  it("returns false when a DebuggerDetachedRecord detached by Chrome has no reason", () => {
    const record = { ...newDebuggerDetachedRecord(1), detachedBy: "chrome" };
    expect(isEventRecord(record)).toBe(false);
  });

  it("returns false when a DebuggerDetachedRecord detached by self has a reason", () => {
    const record = { ...newDebuggerDetachedRecord(1), detachReason: "target_closed" };
    expect(isEventRecord(record)).toBe(false);
  });

  it("returns false when the tab ID is not a number", () => {
    const record = { ...newWatchStartedRecord(1), tabId: "1" };
    expect(isEventRecord(record)).toBe(false);
  });
});

describe("isEventRecordType", () => {
  it("returns true for the type of every record the factories create", () => {
    expect(isEventRecordType(newCaptureStartedRecord().type)).toBe(true);
    expect(isEventRecordType(newCaptureStoppedRecord().type)).toBe(true);
    expect(isEventRecordType(newWatchStartedRecord(1).type)).toBe(true);
    expect(isEventRecordType(newWatchStoppedRecord(1).type)).toBe(true);
    expect(isEventRecordType(newDebuggerAttachedRecord(1, false).type)).toBe(true);
    expect(isEventRecordType(newDebuggerDetachedRecord(1).type)).toBe(true);
    expect(isEventRecordType(newDebuggerDetachedRecord(1, "target_closed").type)).toBe(true);
    expect(isEventRecordType(newArchiveImportedRecord().type)).toBe(true);
  });

  it("returns false for an unknown type or a non-string", () => {
    expect(isEventRecordType("TabClosed")).toBe(false);
    expect(isEventRecordType(42)).toBe(false);
  });

  it("returns false for a property inherited from Object.prototype", () => {
    expect(isEventRecordType("toString")).toBe(false);
  });
});
