/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SamlLog, isSamlLog } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export async function saveSamlLog(samlLog: SamlLog): Promise<void | Error> {
  return await setSessionStorageItem(toSamlLogKey(samlLog), samlLog);
}

export async function deleteSamlLogsBySsoTraceId(ssoTraceId: string): Promise<void | Error> {
  const keys = await findSamlLogKeysBy((k) => k.ssoTraceId === ssoTraceId);
  if (keys instanceof Error) {
    return keys;
  }

  return await removeSessionStorageItems(keys);
}

export async function findSamlLogsBySsoTraceId(ssoTraceId: string): Promise<SamlLog[] | Error> {
  return await findSamlLogsBy((k) => k.ssoTraceId === ssoTraceId);
}

async function findSamlLogsBy(
  predicate: (keyFields: SamlLogKeyFields) => boolean,
): Promise<SamlLog[] | Error> {
  const keys = await findSamlLogKeysBy(predicate);
  if (keys instanceof Error) {
    return keys;
  }

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((l): l is SamlLog => {
      const valid = isSamlLog(l);
      if (!valid) {
        console.warn("Invalid SAML log:", l);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

async function findSamlLogKeysBy(
  predicate: (keyFields: SamlLogKeyFields) => boolean,
): Promise<string[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  return allKeys.filter((k) => {
    const keyFields = parseSamlLogKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });
}

const samlLogKind = "saml";

type SamlLogKeyFields = {
  id: string;
  kind: typeof samlLogKind;
  ssoTraceId: string;
};

function isSamlLogKeyFields(u: unknown): u is SamlLogKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === samlLogKind &&
    typeof u.ssoTraceId === "string"
  );
}

function toSamlLogKey(samlLog: SamlLog): string {
  return JSON.stringify({ ...samlLog, kind: samlLogKind }, ["id", "kind", "ssoTraceId"]);
}

function parseSamlLogKey(key: string): SamlLogKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isSamlLogKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
