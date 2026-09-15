/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { describe, expect, it } from "vitest";
import {
  isTracingLifecycleEvent,
  isTracingLifecycleEventType,
  newArchiveImportedEvent,
  newDebuggingStartedEvent,
  newDebuggingStoppedEvent,
  newTabTracingStartedEvent,
  newTabTracingStoppedEvent,
  newTracingStartedEvent,
  newTracingStoppedEvent,
} from "./tracing-event.ts";

describe("factory functions", () => {
  it("creates a TracingStartedEvent", () => {
    const event = newTracingStartedEvent();
    expect(event.type).toBe("TracingStarted");
  });

  it("creates a TracingStoppedEvent", () => {
    const event = newTracingStoppedEvent();
    expect(event.type).toBe("TracingStopped");
  });

  it("creates a TabTracingStartedEvent with the tab ID", () => {
    const event = newTabTracingStartedEvent(42);
    expect(event.type).toBe("TabTracingStarted");
    expect(event.tabId).toBe(42);
  });

  it("creates a TabTracingStoppedEvent with the tab ID", () => {
    const event = newTabTracingStoppedEvent(42);
    expect(event.type).toBe("TabTracingStopped");
    expect(event.tabId).toBe(42);
  });

  it("creates a DebuggingStartedEvent with the tab ID and isRetry flag", () => {
    const event = newDebuggingStartedEvent(42, true);
    expect(event.type).toBe("DebuggingStarted");
    expect(event.tabId).toBe(42);
    expect(event.isRetry).toBe(true);
  });

  it("creates a DebuggingStoppedEvent detached by self when no reason is given", () => {
    const event = newDebuggingStoppedEvent(42);
    expect(event.type).toBe("DebuggingStopped");
    expect(event.tabId).toBe(42);
    expect(event.detachedBy).toBe("self");
    expect(event).not.toHaveProperty("detachReason");
  });

  it("creates a DebuggingStoppedEvent detached by Chrome when a reason is given", () => {
    const event = newDebuggingStoppedEvent(42, "target_closed");
    expect(event.type).toBe("DebuggingStopped");
    expect(event.tabId).toBe(42);
    expect(event.detachedBy).toBe("chrome");
    expect(event).toHaveProperty("detachReason", "target_closed");
  });

  it("creates an ArchiveImportedEvent", () => {
    const event = newArchiveImportedEvent();
    expect(event.type).toBe("ArchiveImported");
  });

  it("assigns a UUIDv7 as the ID", () => {
    const event = newTracingStartedEvent();
    expect(uuidValidate(event.id)).toBe(true);
    expect(uuidVersion(event.id)).toBe(7);
  });

  it("assigns an ISO 8601 date", () => {
    const event = newTracingStartedEvent();
    expect(new Date(event.recordedAt).toISOString()).toBe(event.recordedAt);
  });

  it("assigns IDs that sort in generation order", () => {
    const ids = [
      newTracingStartedEvent().id,
      newTabTracingStartedEvent(1).id,
      newDebuggingStartedEvent(1, false).id,
      newDebuggingStoppedEvent(1, "canceled_by_user").id,
      newTabTracingStoppedEvent(1).id,
      newTracingStoppedEvent().id,
      newArchiveImportedEvent().id,
    ];
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("isTracingLifecycleEvent", () => {
  it("returns true for every event the factories create", () => {
    expect(isTracingLifecycleEvent(newTracingStartedEvent())).toBe(true);
    expect(isTracingLifecycleEvent(newTracingStoppedEvent())).toBe(true);
    expect(isTracingLifecycleEvent(newTabTracingStartedEvent(1))).toBe(true);
    expect(isTracingLifecycleEvent(newTabTracingStoppedEvent(1))).toBe(true);
    expect(isTracingLifecycleEvent(newDebuggingStartedEvent(1, false))).toBe(true);
    expect(isTracingLifecycleEvent(newDebuggingStoppedEvent(1))).toBe(true);
    expect(isTracingLifecycleEvent(newDebuggingStoppedEvent(1, "target_closed"))).toBe(true);
    expect(isTracingLifecycleEvent(newArchiveImportedEvent())).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isTracingLifecycleEvent(null)).toBe(false);
    expect(isTracingLifecycleEvent(undefined)).toBe(false);
    expect(isTracingLifecycleEvent("TracingStarted")).toBe(false);
    expect(isTracingLifecycleEvent(42)).toBe(false);
  });

  it("returns false for an object without a type", () => {
    const { type: _, ...rest } = newTracingStartedEvent();
    expect(isTracingLifecycleEvent(rest)).toBe(false);
  });

  it("returns false for an unknown type", () => {
    const event = { ...newTracingStartedEvent(), type: "TabClosed" };
    expect(isTracingLifecycleEvent(event)).toBe(false);
  });

  it("returns false when the ID is missing", () => {
    const { id: _, ...rest } = newTracingStartedEvent();
    expect(isTracingLifecycleEvent(rest)).toBe(false);
  });

  it("returns false when recordedAt is missing", () => {
    const { recordedAt: _, ...rest } = newTracingStartedEvent();
    expect(isTracingLifecycleEvent(rest)).toBe(false);
  });

  it("returns false when a tab-scoped event has no tab ID", () => {
    const { tabId: _, ...rest } = newTabTracingStartedEvent(1);
    expect(isTracingLifecycleEvent(rest)).toBe(false);
  });

  it("returns false when a DebuggingStartedEvent has no isRetry flag", () => {
    const { isRetry: _, ...rest } = newDebuggingStartedEvent(1, false);
    expect(isTracingLifecycleEvent(rest)).toBe(false);
  });

  it("returns false when a DebuggingStoppedEvent has an unknown detachedBy", () => {
    const event = { ...newDebuggingStoppedEvent(1), detachedBy: "user" };
    expect(isTracingLifecycleEvent(event)).toBe(false);
  });

  it("returns false when a DebuggingStoppedEvent detached by Chrome has no reason", () => {
    const event = { ...newDebuggingStoppedEvent(1), detachedBy: "chrome" };
    expect(isTracingLifecycleEvent(event)).toBe(false);
  });

  it("returns false when a DebuggingStoppedEvent detached by self has a reason", () => {
    const event = { ...newDebuggingStoppedEvent(1), detachReason: "target_closed" };
    expect(isTracingLifecycleEvent(event)).toBe(false);
  });

  it("returns false when the tab ID is not a number", () => {
    const event = { ...newTabTracingStartedEvent(1), tabId: "1" };
    expect(isTracingLifecycleEvent(event)).toBe(false);
  });
});

describe("isTracingLifecycleEventType", () => {
  it("returns true for the type of every event the factories create", () => {
    expect(isTracingLifecycleEventType(newTracingStartedEvent().type)).toBe(true);
    expect(isTracingLifecycleEventType(newTracingStoppedEvent().type)).toBe(true);
    expect(isTracingLifecycleEventType(newTabTracingStartedEvent(1).type)).toBe(true);
    expect(isTracingLifecycleEventType(newTabTracingStoppedEvent(1).type)).toBe(true);
    expect(isTracingLifecycleEventType(newDebuggingStartedEvent(1, false).type)).toBe(true);
    expect(isTracingLifecycleEventType(newDebuggingStoppedEvent(1).type)).toBe(true);
    expect(isTracingLifecycleEventType(newDebuggingStoppedEvent(1, "target_closed").type)).toBe(
      true,
    );
    expect(isTracingLifecycleEventType(newArchiveImportedEvent().type)).toBe(true);
  });

  it("returns false for an unknown type or a non-string", () => {
    expect(isTracingLifecycleEventType("TabClosed")).toBe(false);
    expect(isTracingLifecycleEventType(42)).toBe(false);
  });

  it("returns false for a property inherited from Object.prototype", () => {
    expect(isTracingLifecycleEventType("toString")).toBe(false);
  });
});
