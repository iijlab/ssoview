/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { isObject } from "@/common/utils/type-guard.ts";
import {
  type EventRecord,
  type EventRecordType,
  isEventRecord,
  isEventRecordType,
} from "@/common/models/event-record.ts";

export async function storeEventRecord(record: EventRecord): Promise<void | Error> {
  return await setSessionStorageItem(makeEventRecordKey(record), record);
}

export async function retrieveEventRecordKeyFields(
  eventRecordTypes: EventRecordType[],
): Promise<EventRecordKeyFields[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  return allKeys
    .map(parseEventRecordKey)
    .filter((f) => f !== undefined)
    .filter((f) => eventRecordTypes.includes(f.type))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

export async function retrieveAllEventRecords(): Promise<EventRecord[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter(isEventRecordKey);
  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((u: unknown): u is EventRecord => {
      const valid = isEventRecord(u);
      if (!valid) {
        console.warn("Invalid event record:", u);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const eventRecordKind = "event";

export type EventRecordKeyFields = {
  id: string;
  kind: typeof eventRecordKind;
  type: EventRecordType;
  tabId?: number;
};

function isEventRecordKeyFields(u: unknown): u is EventRecordKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === eventRecordKind &&
    isEventRecordType(u.type) &&
    (!("tabId" in u) || typeof u.tabId === "number")
  );
}

function makeEventRecordKey(record: EventRecord): string {
  return JSON.stringify({ ...record, kind: eventRecordKind }, ["id", "kind", "type", "tabId"]);
}

function isEventRecordKey(key: string): boolean {
  return parseEventRecordKey(key) !== undefined;
}

function parseEventRecordKey(key: string): EventRecordKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isEventRecordKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
