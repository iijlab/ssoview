/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  type HttpMessage,
  type HttpRequest,
  type HttpResponse,
  isHttpMessage,
} from "@/common/models/http-message.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export async function saveHttpMessage(httpMessage: HttpMessage): Promise<void | Error> {
  return await setSessionStorageItem(makeHttpMessageKey(httpMessage), httpMessage);
}

export async function findHttpMessagesByIds(ids: string[]): Promise<HttpMessage[] | Error> {
  const idSet = new Set(ids);
  return await findHttpMessagesBy((k) => idSet.has(k.id));
}

export async function findPairedHttpRequest(
  httpResponse: HttpResponse,
): Promise<HttpRequest | undefined | Error> {
  const { captureSessionId, tabId, fetchRequestId } = httpResponse;
  if (tabId === undefined || fetchRequestId === undefined) {
    return undefined;
  }

  const httpMessages = await findHttpMessagesBy(
    (k) =>
      k.stage === "Request" &&
      k.captureSessionId === captureSessionId &&
      k.tabId === tabId &&
      k.fetchRequestId === fetchRequestId,
  );
  if (httpMessages instanceof Error) {
    return httpMessages;
  }

  return httpMessages.find((m): m is HttpRequest => m.stage === "Request");
}

export async function deleteHttpMessages(httpMessages: HttpMessage[]): Promise<void | Error> {
  return await removeSessionStorageItems(httpMessages.map(makeHttpMessageKey));
}

async function findHttpMessagesBy(
  predicate: (keyFields: HttpMessageKeyFields) => boolean,
): Promise<HttpMessage[] | Error> {
  const allKeys = await getAllSessionStorageKeys();
  if (allKeys instanceof Error) {
    return allKeys;
  }

  const keys = allKeys.filter((k) => {
    const keyFields = parseHttpMessageKey(k);
    return keyFields !== undefined && predicate(keyFields);
  });

  const items = await getSessionStorageItems(keys);
  if (items instanceof Error) {
    return items;
  }

  return Object.values(items)
    .filter((m): m is HttpMessage => {
      const valid = isHttpMessage(m);
      if (!valid) {
        console.warn("Invalid HTTP message:", m);
      }
      return valid;
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

const httpMessageKind = "http";

type HttpMessageKeyFields = {
  id: string;
  kind: typeof httpMessageKind;
  captureSessionId: string;
  tabId?: number;
  fetchRequestId?: string;
  stage: HttpMessage["stage"];
};

function isHttpMessageKeyFields(u: unknown): u is HttpMessageKeyFields {
  return (
    isObject(u) &&
    typeof u.id === "string" &&
    u.kind === httpMessageKind &&
    typeof u.captureSessionId === "string" &&
    (!("tabId" in u) || typeof u.tabId === "number") &&
    (!("fetchRequestId" in u) || typeof u.fetchRequestId === "string") &&
    (u.stage === "Request" || u.stage === "Response")
  );
}

function makeHttpMessageKey(httpMessage: HttpMessage): string {
  return JSON.stringify({ ...httpMessage, kind: httpMessageKind }, [
    "id",
    "kind",
    "captureSessionId",
    "tabId",
    "fetchRequestId",
    "stage",
  ]);
}

function parseHttpMessageKey(key: string): HttpMessageKeyFields | undefined {
  try {
    const parsed: unknown = JSON.parse(key);
    return isHttpMessageKeyFields(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
