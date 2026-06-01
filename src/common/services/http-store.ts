/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type HttpMessage,
  ensureLoadedHttpMessage,
  isHttpMessage,
} from "@/common/models/http-message.ts";
import { makeStorageKey, makeStorageKeyPrefix } from "@/common/services/storage-key.ts";
import {
  getSessionStorageItemsByKeyPrefix,
  removeSessionStorageItemsByKeyPrefix,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";

const STORAGE_NAMESPACE = "http";

function makeStorageKeyForHttpMessage(
  tabId: number,
  sessionId: string,
  requestId: string,
  stage: string,
): string {
  return makeStorageKey(STORAGE_NAMESPACE, [`${tabId}`, sessionId, requestId, stage]);
}

function makeStorageKeyPrefixForHttpMessages(tabId: number, sessionId?: string): string {
  const segments = sessionId !== undefined ? [`${tabId}`, sessionId] : [`${tabId}`];
  return makeStorageKeyPrefix(STORAGE_NAMESPACE, segments);
}

export async function storeHttpMessage(
  httpMessage: HttpMessage,
  tabId: number,
  sessionId: string,
): Promise<void | Error> {
  const key = makeStorageKeyForHttpMessage(
    tabId,
    sessionId,
    httpMessage.requestId,
    httpMessage.stage,
  );
  const loadedHttpMessage = await ensureLoadedHttpMessage(httpMessage);
  if (loadedHttpMessage instanceof Error) {
    return loadedHttpMessage;
  }

  return setSessionStorageItem(key, loadedHttpMessage);
}

export async function retrieveHttpMessages(
  tabId: number,
  sessionId: string,
): Promise<HttpMessage[] | Error> {
  const keyPrefix = makeStorageKeyPrefixForHttpMessages(tabId, sessionId);
  const items = await getSessionStorageItemsByKeyPrefix(keyPrefix);
  if (items instanceof Error) {
    return items;
  }

  return Object.keys(items)
    .toSorted()
    .map((k) => items[k])
    .filter((u: unknown): u is HttpMessage => {
      const valid = isHttpMessage(u);
      if (!valid) {
        console.warn("Invalid HTTP message:", u);
      }
      return valid;
    });
}

export async function purgeHttpMessages(tabId: number, sessionId: string): Promise<void | Error> {
  const keyPrefix = makeStorageKeyPrefixForHttpMessages(tabId, sessionId);
  return removeSessionStorageItemsByKeyPrefix(keyPrefix);
}
