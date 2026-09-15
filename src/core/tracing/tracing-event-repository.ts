/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type TracingLifecycleEvent,
  type TracingLifecycleEventType,
  isTracingLifecycleEvent,
  isTracingLifecycleEventType,
} from "@/core/tracing/tracing-event.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/shared/chrome-storage.ts";
import { isObject } from "@/shared/type-guard.ts";

export async function saveTracingLifecycleEvent(
  tracingLifecycleEvent: TracingLifecycleEvent,
): Promise<void | Error> {
  return await setSessionStorageItem(
    toTracingLifecycleEventKey(tracingLifecycleEvent),
    tracingLifecycleEvent,
  );
}

export async function findAllTracingLifecycleEvents(): Promise<TracingLifecycleEvent[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter((k) => parseTracingLifecycleEventKey(k) !== undefined);
  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((e): e is TracingLifecycleEvent => {
      const valid = isTracingLifecycleEvent(e);
      if (!valid) {
        console.warn("Invalid tracing lifecycle event:", e);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const tracingLifecycleEventKind = "event";

type TracingLifecycleEventKeyFields = {
  id: string;
  kind: typeof tracingLifecycleEventKind;
  type: TracingLifecycleEventType;
  tabId?: number;
};

function isTracingLifecycleEventKeyFields(u: unknown): u is TracingLifecycleEventKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === tracingLifecycleEventKind &&
    isTracingLifecycleEventType(u.type) &&
    (!("tabId" in u) || typeof u.tabId === "number")
  );
}

function toTracingLifecycleEventKey(tracingLifecycleEvent: TracingLifecycleEvent): string {
  return JSON.stringify({ ...tracingLifecycleEvent, kind: tracingLifecycleEventKind }, [
    "id",
    "kind",
    "type",
    "tabId",
  ]);
}

function parseTracingLifecycleEventKey(key: string): TracingLifecycleEventKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isTracingLifecycleEventKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
