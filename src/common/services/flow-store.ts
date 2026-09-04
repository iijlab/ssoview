/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type FlowEntry, isFlowEntry } from "@/common/models/flow-entry.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export async function saveFlowEntry(flowEntry: FlowEntry): Promise<void | Error> {
  return await setSessionStorageItem(makeFlowEntryKey(flowEntry), flowEntry);
}

export async function deleteFlowEntry(flowEntry: FlowEntry): Promise<void | Error> {
  return await removeSessionStorageItems([makeFlowEntryKey(flowEntry)]);
}

export async function findFlowEntriesByCaptureSessionId(
  captureSessionId: string,
): Promise<FlowEntry[] | Error> {
  const entries = await findFlowEntriesBy((e) => e.captureSessionId === captureSessionId);
  if (entries instanceof Error) {
    return entries;
  }

  return entries.toReversed();
}

export async function findFlowEntryById(id: string): Promise<FlowEntry | undefined | Error> {
  const entries = await findFlowEntriesBy((e) => e.id === id);
  if (entries instanceof Error) {
    return entries;
  }

  return entries[0];
}

export async function findFlowEntryByCorrelationKey(
  captureSessionId: string,
  correlationKey: string,
): Promise<FlowEntry | undefined | Error> {
  const entries = await findFlowEntriesBy(
    (e) => e.captureSessionId === captureSessionId && e.correlationKey === correlationKey,
  );
  if (entries instanceof Error) {
    return entries;
  }

  return entries[0];
}

async function findFlowEntriesBy(
  predicate: (keyFields: FlowEntryKeyFields) => boolean,
): Promise<FlowEntry[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter((k) => {
    const keyFields = parseFlowEntryKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((e): e is FlowEntry => {
      const valid = isFlowEntry(e);
      if (!valid) {
        console.warn("Invalid flow entry:", e);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const flowEntryKind = "flow";

type FlowEntryKeyFields = {
  id: string;
  kind: typeof flowEntryKind;
  captureSessionId: string;
  correlationKey: string;
};

function isFlowEntryKeyFields(u: unknown): u is FlowEntryKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === flowEntryKind &&
    typeof u.captureSessionId === "string" &&
    typeof u.correlationKey === "string"
  );
}

function makeFlowEntryKey(flow: FlowEntry): string {
  return JSON.stringify({ ...flow, kind: flowEntryKind }, [
    "id",
    "kind",
    "captureSessionId",
    "correlationKey",
  ]);
}

function parseFlowEntryKey(key: string): FlowEntryKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isFlowEntryKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
