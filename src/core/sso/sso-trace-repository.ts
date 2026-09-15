/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SsoTrace, isSsoTrace } from "@/core/sso/sso-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/shared/chrome-storage.ts";
import { isObject } from "@/shared/type-guard.ts";

export async function saveSsoTrace(ssoTrace: SsoTrace): Promise<void | Error> {
  return await setSessionStorageItem(toSsoTraceKey(ssoTrace), ssoTrace);
}

export async function deleteSsoTrace(ssoTrace: SsoTrace): Promise<void | Error> {
  return await removeSessionStorageItems([toSsoTraceKey(ssoTrace)]);
}

export async function findAllSsoTraces(): Promise<SsoTrace[] | Error> {
  const ssoTraces = await findSsoTracesBy(() => true);
  if (ssoTraces instanceof Error) {
    return ssoTraces;
  }

  return ssoTraces.toReversed();
}

export async function findSsoTraceById(id: string): Promise<SsoTrace | undefined | Error> {
  const ssoTraces = await findSsoTracesBy((t) => t.id === id);
  if (ssoTraces instanceof Error) {
    return ssoTraces;
  }

  return ssoTraces[0];
}

export async function findSsoTraceByCorrelationKey(
  tracingSessionId: string,
  correlationKey: string,
): Promise<SsoTrace | undefined | Error> {
  const ssoTraces = await findSsoTracesBy(
    (t) => t.tracingSessionId === tracingSessionId && t.correlationKey === correlationKey,
  );
  if (ssoTraces instanceof Error) {
    return ssoTraces;
  }

  return ssoTraces[0];
}

async function findSsoTracesBy(
  predicate: (keyFields: SsoTraceKeyFields) => boolean,
): Promise<SsoTrace[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter((k) => {
    const keyFields = parseSsoTraceKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((t): t is SsoTrace => {
      const valid = isSsoTrace(t);
      if (!valid) {
        console.warn("Invalid SSO trace:", t);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const ssoTraceKind = "trace";

type SsoTraceKeyFields = {
  id: string;
  kind: typeof ssoTraceKind;
  tracingSessionId: string;
  correlationKey: string;
};

function isSsoTraceKeyFields(u: unknown): u is SsoTraceKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === ssoTraceKind &&
    typeof u.tracingSessionId === "string" &&
    typeof u.correlationKey === "string"
  );
}

function toSsoTraceKey(ssoTrace: SsoTrace): string {
  return JSON.stringify({ ...ssoTrace, kind: ssoTraceKind }, [
    "id",
    "kind",
    "tracingSessionId",
    "correlationKey",
  ]);
}

function parseSsoTraceKey(key: string): SsoTraceKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isSsoTraceKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
