/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SamlTrace, isSamlTrace } from "@/common/models/saml-trace.ts";
import { makeStorageKey, makeStorageKeyPrefix } from "@/common/services/storage-key.ts";
import {
  getSessionStorageItemsByKeyPrefix,
  removeSessionStorageItemsByKeyPrefix,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";

const STORAGE_NAMESPACE = "saml";

function makeStorageKeyForSamlTrace(tabId: number, sessionId: string, step: number): string {
  return makeStorageKey(STORAGE_NAMESPACE, [`${tabId}`, sessionId, `${step}`]);
}

function makeStorageKeyPrefixForSamlTraces(tabId: number, sessionId?: string): string {
  const segments = sessionId !== undefined ? [`${tabId}`, sessionId] : [`${tabId}`];
  return makeStorageKeyPrefix(STORAGE_NAMESPACE, segments);
}

export async function storeSamlTrace(samlTrace: SamlTrace, tabId: number): Promise<void | Error> {
  const key = makeStorageKeyForSamlTrace(tabId, samlTrace.sessionId, samlTrace.step);
  return await setSessionStorageItem(key, samlTrace);
}

export async function retrieveSamlTraces(
  tabId: number,
  sessionId?: string,
): Promise<SamlTrace[] | Error> {
  const keyPrefix = makeStorageKeyPrefixForSamlTraces(tabId, sessionId);
  const items = await getSessionStorageItemsByKeyPrefix(keyPrefix);
  if (items instanceof Error) {
    return items;
  }

  return Object.keys(items)
    .toSorted()
    .map((k) => items[k])
    .filter((u: unknown): u is SamlTrace => {
      const valid = isSamlTrace(u);
      if (!valid) {
        console.warn("Invalid SAML trace:", u);
      }
      return valid;
    });
}

export async function purgeSamlTraces(tabId: number, sessionId: string): Promise<void | Error> {
  const keyPrefix = makeStorageKeyPrefixForSamlTraces(tabId, sessionId);
  return await removeSessionStorageItemsByKeyPrefix(keyPrefix);
}
