/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SamlTrace, isSamlTrace } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export async function saveSamlTrace(samlTrace: SamlTrace, tabId: number): Promise<void | Error> {
  return await setSessionStorageItem(makeSamlTraceKey(samlTrace, tabId), samlTrace);
}

export async function deleteSamlTraces(tabId: number, sessionId: string): Promise<void | Error> {
  const entries = await findSamlTraceEntriesBy((k) => k.tabId === tabId);
  if (entries instanceof Error) {
    return entries;
  }

  const keys = entries
    .filter(([, samlTrace]) => samlTrace.sessionId === sessionId)
    .map(([key]) => key);
  return await removeSessionStorageItems(keys);
}

export async function findSamlTraces(
  tabId: number,
  sessionId?: string,
): Promise<SamlTrace[] | Error> {
  const entries = await findSamlTraceEntriesBy((k) => k.tabId === tabId);
  if (entries instanceof Error) {
    return entries;
  }

  const samlTraces = entries.map(([, samlTrace]) => samlTrace);
  return sessionId === undefined ? samlTraces : samlTraces.filter((t) => t.sessionId === sessionId);
}

async function findSamlTraceEntriesBy(
  predicate: (keyFields: SamlTraceKeyFields) => boolean,
): Promise<[string, SamlTrace][] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter((k) => {
    const keyFields = parseSamlTraceKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.entries(items)
    .filter((entry): entry is [string, SamlTrace] => {
      const valid = isSamlTrace(entry[1]);
      if (!valid) {
        console.warn("Invalid SAML trace:", entry[1]);
      }
      return valid;
    })
    .toSorted(([, a], [, b]) => (a.id < b.id ? -1 : 1));
}

const samlTraceKind = "trace";

type SamlTraceKeyFields = {
  id: string;
  kind: typeof samlTraceKind;
  tabId: number;
  flowId: string;
};

function isSamlTraceKeyFields(u: unknown): u is SamlTraceKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === samlTraceKind &&
    typeof u.tabId === "number" &&
    typeof u.flowId === "string"
  );
}

function makeSamlTraceKey(samlTrace: SamlTrace, tabId: number): string {
  return JSON.stringify({ ...samlTrace, kind: samlTraceKind, tabId }, [
    "id",
    "kind",
    "tabId",
    "flowId",
  ]);
}

function parseSamlTraceKey(key: string): SamlTraceKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isSamlTraceKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
