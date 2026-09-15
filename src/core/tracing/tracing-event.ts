/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { isObject } from "@/shared/type-guard.ts";

export type TracingLifecycleEvent =
  | TracingStartedEvent
  | TracingStoppedEvent
  | TabTracingStartedEvent
  | TabTracingStoppedEvent
  | DebuggingStartedEvent
  | DebuggingStoppedEvent
  | ArchiveImportedEvent;

export function isTracingLifecycleEvent(u: unknown): u is TracingLifecycleEvent {
  return (
    isTracingStartedEvent(u) ||
    isTracingStoppedEvent(u) ||
    isTabTracingStartedEvent(u) ||
    isTabTracingStoppedEvent(u) ||
    isDebuggingStartedEvent(u) ||
    isDebuggingStoppedEvent(u) ||
    isArchiveImportedEvent(u)
  );
}

export type TracingLifecycleEventType = TracingLifecycleEvent["type"];

const tracingLifecycleEventTypeMap: Record<TracingLifecycleEventType, true> = {
  TracingStarted: true,
  TracingStopped: true,
  TabTracingStarted: true,
  TabTracingStopped: true,
  DebuggingStarted: true,
  DebuggingStopped: true,
  ArchiveImported: true,
};

export function isTracingLifecycleEventType(u: unknown): u is TracingLifecycleEventType {
  return typeof u === "string" && Object.hasOwn(tracingLifecycleEventTypeMap, u);
}

type TracingLifecycleEventBase = {
  id: string;
  recordedAt: string;
};

function isTracingLifecycleEventBase(u: unknown): u is TracingLifecycleEventBase {
  return isObject(u) && typeof u.id === "string" && typeof u.recordedAt === "string";
}

function newTracingLifecycleEventBase(): TracingLifecycleEventBase {
  return {
    id: uuidv7(),
    recordedAt: new Date().toISOString(),
  };
}

export type TracingStartedEvent = TracingLifecycleEventBase & {
  type: "TracingStarted";
};

function isTracingStartedEvent(u: unknown): u is TracingStartedEvent {
  return isObject(u) && u.type === "TracingStarted" && isTracingLifecycleEventBase(u);
}

export function newTracingStartedEvent(): TracingStartedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "TracingStarted",
  };
}

export type TracingStoppedEvent = TracingLifecycleEventBase & {
  type: "TracingStopped";
};

function isTracingStoppedEvent(u: unknown): u is TracingStoppedEvent {
  return isObject(u) && u.type === "TracingStopped" && isTracingLifecycleEventBase(u);
}

export function newTracingStoppedEvent(): TracingStoppedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "TracingStopped",
  };
}

export type TabTracingStartedEvent = TracingLifecycleEventBase & {
  type: "TabTracingStarted";
  tabId: number;
};

function isTabTracingStartedEvent(u: unknown): u is TabTracingStartedEvent {
  return (
    isObject(u) &&
    u.type === "TabTracingStarted" &&
    typeof u.tabId === "number" &&
    isTracingLifecycleEventBase(u)
  );
}

export function newTabTracingStartedEvent(tabId: number): TabTracingStartedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "TabTracingStarted",
    tabId,
  };
}

export type TabTracingStoppedEvent = TracingLifecycleEventBase & {
  type: "TabTracingStopped";
  tabId: number;
};

function isTabTracingStoppedEvent(u: unknown): u is TabTracingStoppedEvent {
  return (
    isObject(u) &&
    u.type === "TabTracingStopped" &&
    typeof u.tabId === "number" &&
    isTracingLifecycleEventBase(u)
  );
}

export function newTabTracingStoppedEvent(tabId: number): TabTracingStoppedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "TabTracingStopped",
    tabId,
  };
}

export type DebuggingStartedEvent = TracingLifecycleEventBase & {
  type: "DebuggingStarted";
  tabId: number;
  isRetry: boolean;
};

function isDebuggingStartedEvent(u: unknown): u is DebuggingStartedEvent {
  return (
    isObject(u) &&
    u.type === "DebuggingStarted" &&
    typeof u.tabId === "number" &&
    typeof u.isRetry === "boolean" &&
    isTracingLifecycleEventBase(u)
  );
}

export function newDebuggingStartedEvent(tabId: number, isRetry: boolean): DebuggingStartedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "DebuggingStarted",
    tabId,
    isRetry,
  };
}

export type DebuggingStoppedEvent = TracingLifecycleEventBase & {
  type: "DebuggingStopped";
  tabId: number;
} & ({ detachedBy: "self" } | { detachedBy: "chrome"; detachReason: string });

function isDebuggingStoppedEvent(u: unknown): u is DebuggingStoppedEvent {
  return (
    isObject(u) &&
    u.type === "DebuggingStopped" &&
    typeof u.tabId === "number" &&
    ((u.detachedBy === "self" && !("detachReason" in u)) ||
      (u.detachedBy === "chrome" && typeof u.detachReason === "string")) &&
    isTracingLifecycleEventBase(u)
  );
}

export function newDebuggingStoppedEvent(
  tabId: number,
  detachReason?: string,
): DebuggingStoppedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "DebuggingStopped",
    tabId,
    ...(detachReason === undefined
      ? { detachedBy: "self" }
      : { detachedBy: "chrome", detachReason }),
  };
}

export type ArchiveImportedEvent = TracingLifecycleEventBase & {
  type: "ArchiveImported";
};

function isArchiveImportedEvent(u: unknown): u is ArchiveImportedEvent {
  return isObject(u) && u.type === "ArchiveImported" && isTracingLifecycleEventBase(u);
}

export function newArchiveImportedEvent(): ArchiveImportedEvent {
  return {
    ...newTracingLifecycleEventBase(),
    type: "ArchiveImported",
  };
}
