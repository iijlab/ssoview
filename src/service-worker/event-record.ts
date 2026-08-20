/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { v7 as uuidv7 } from "uuid";
import { isObject } from "@/common/utils/type-guard.ts";

export type EventRecord =
  | CaptureStartedRecord
  | CaptureStoppedRecord
  | WatchStartedRecord
  | WatchStoppedRecord
  | DebuggerAttachedRecord
  | DebuggerDetachedRecord;

export function isEventRecord(u: unknown): u is EventRecord {
  return (
    isCaptureStartedRecord(u) ||
    isCaptureStoppedRecord(u) ||
    isWatchStartedRecord(u) ||
    isWatchStoppedRecord(u) ||
    isDebuggerAttachedRecord(u) ||
    isDebuggerDetachedRecord(u)
  );
}

export type EventRecordType = EventRecord["type"];

const eventRecordTypeMap: Record<EventRecordType, true> = {
  CaptureStarted: true,
  CaptureStopped: true,
  WatchStarted: true,
  WatchStopped: true,
  DebuggerAttached: true,
  DebuggerDetached: true,
};

export function isEventRecordType(u: unknown): u is EventRecordType {
  return typeof u === "string" && Object.hasOwn(eventRecordTypeMap, u);
}

type EventRecordBase = {
  id: string;
  date: string;
};

function isEventRecordBase(u: unknown): u is EventRecordBase {
  return isObject(u) && typeof u.id === "string" && typeof u.date === "string";
}

function newEventRecordBase(): EventRecordBase {
  return {
    id: uuidv7(),
    date: new Date().toISOString(),
  };
}

export type CaptureStartedRecord = EventRecordBase & {
  type: "CaptureStarted";
};

function isCaptureStartedRecord(u: unknown): u is CaptureStartedRecord {
  return isObject(u) && u.type === "CaptureStarted" && isEventRecordBase(u);
}

export function newCaptureStartedRecord(): CaptureStartedRecord {
  return {
    ...newEventRecordBase(),
    type: "CaptureStarted",
  };
}

export type CaptureStoppedRecord = EventRecordBase & {
  type: "CaptureStopped";
};

function isCaptureStoppedRecord(u: unknown): u is CaptureStoppedRecord {
  return isObject(u) && u.type === "CaptureStopped" && isEventRecordBase(u);
}

export function newCaptureStoppedRecord(): CaptureStoppedRecord {
  return {
    ...newEventRecordBase(),
    type: "CaptureStopped",
  };
}

export type WatchStartedRecord = EventRecordBase & {
  type: "WatchStarted";
  tabId: number;
};

function isWatchStartedRecord(u: unknown): u is WatchStartedRecord {
  return (
    isObject(u) && u.type === "WatchStarted" && typeof u.tabId === "number" && isEventRecordBase(u)
  );
}

export function newWatchStartedRecord(tabId: number): WatchStartedRecord {
  return {
    ...newEventRecordBase(),
    type: "WatchStarted",
    tabId,
  };
}

export type WatchStoppedRecord = EventRecordBase & {
  type: "WatchStopped";
  tabId: number;
};

function isWatchStoppedRecord(u: unknown): u is WatchStoppedRecord {
  return (
    isObject(u) && u.type === "WatchStopped" && typeof u.tabId === "number" && isEventRecordBase(u)
  );
}

export function newWatchStoppedRecord(tabId: number): WatchStoppedRecord {
  return {
    ...newEventRecordBase(),
    type: "WatchStopped",
    tabId,
  };
}

export type DebuggerAttachedRecord = EventRecordBase & {
  type: "DebuggerAttached";
  tabId: number;
  retry: boolean;
};

function isDebuggerAttachedRecord(u: unknown): u is DebuggerAttachedRecord {
  return (
    isObject(u) &&
    u.type === "DebuggerAttached" &&
    typeof u.tabId === "number" &&
    typeof u.retry === "boolean" &&
    isEventRecordBase(u)
  );
}

export function newDebuggerAttachedRecord(tabId: number, retry: boolean): DebuggerAttachedRecord {
  return {
    ...newEventRecordBase(),
    type: "DebuggerAttached",
    tabId,
    retry,
  };
}

export type DebuggerDetachedRecord = EventRecordBase & {
  type: "DebuggerDetached";
  tabId: number;
} & ({ detachedBy: "self" } | { detachedBy: "chrome"; detachReason: string });

function isDebuggerDetachedRecord(u: unknown): u is DebuggerDetachedRecord {
  return (
    isObject(u) &&
    u.type === "DebuggerDetached" &&
    typeof u.tabId === "number" &&
    ((u.detachedBy === "self" && !("detachReason" in u)) ||
      (u.detachedBy === "chrome" && typeof u.detachReason === "string")) &&
    isEventRecordBase(u)
  );
}

export function newDebuggerDetachedRecord(
  tabId: number,
  detachReason?: string,
): DebuggerDetachedRecord {
  return {
    ...newEventRecordBase(),
    type: "DebuggerDetached",
    tabId,
    ...(detachReason === undefined
      ? { detachedBy: "self" }
      : { detachedBy: "chrome", detachReason }),
  };
}
