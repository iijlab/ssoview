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

export async function saveSamlTrace(samlTrace: SamlTrace): Promise<void | Error> {
  return await setSessionStorageItem(makeSamlTraceKey(samlTrace), samlTrace);
}

export async function deleteSamlTracesByFlowId(flowId: string): Promise<void | Error> {
  const keys = await findSamlTraceKeysBy((k) => k.flowId === flowId);
  if (keys instanceof Error) {
    return keys;
  }

  return await removeSessionStorageItems(keys);
}

export async function findSamlTracesByFlowId(flowId: string): Promise<SamlTrace[] | Error> {
  return await findSamlTracesBy((k) => k.flowId === flowId);
}

async function findSamlTracesBy(
  predicate: (keyFields: SamlTraceKeyFields) => boolean,
): Promise<SamlTrace[] | Error> {
  const keys = await findSamlTraceKeysBy(predicate);
  if (keys instanceof Error) {
    return keys;
  }

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((t): t is SamlTrace => {
      const valid = isSamlTrace(t);
      if (!valid) {
        console.warn("Invalid SAML trace:", t);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

async function findSamlTraceKeysBy(
  predicate: (keyFields: SamlTraceKeyFields) => boolean,
): Promise<string[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  return allKeys.filter((k) => {
    const keyFields = parseSamlTraceKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });
}

const samlTraceKind = "trace";

type SamlTraceKeyFields = {
  id: string;
  kind: typeof samlTraceKind;
  flowId: string;
};

function isSamlTraceKeyFields(u: unknown): u is SamlTraceKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === samlTraceKind &&
    typeof u.flowId === "string"
  );
}

function makeSamlTraceKey(samlTrace: SamlTrace): string {
  return JSON.stringify({ ...samlTrace, kind: samlTraceKind }, ["id", "kind", "flowId"]);
}

function parseSamlTraceKey(key: string): SamlTraceKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isSamlTraceKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
