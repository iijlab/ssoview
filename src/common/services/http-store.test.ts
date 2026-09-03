/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/common/models/http-message.ts";
import {
  getSessionStorageItemsByKeyPrefix,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { deleteHttpMessages, retrieveHttpMessages, storeHttpMessage } from "./http-store.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getSessionStorageItemsByKeyPrefix: vi.fn(),
  removeSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

let storage: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();

  storage = {};
  vi.mocked(getSessionStorageItemsByKeyPrefix).mockImplementation(async (keyPrefix) =>
    Object.fromEntries(Object.entries(storage).filter(([k]) => k.startsWith(keyPrefix))),
  );
  vi.mocked(removeSessionStorageItems).mockImplementation(async (keys) => {
    for (const key of keys) {
      delete storage[key];
    }
  });
  vi.mocked(setSessionStorageItem).mockImplementation(async (key, value) => {
    storage[key] = value;
  });
});

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpMessage {
  return {
    id: "msg-1",
    createdAt: "2026-01-01T00:00:00Z",
    captureSessionId: "cs-1",
    tabId: 1,
    fetchRequestId: "req-1",
    url: "https://sp.example.com/",
    method: "GET",
    headers: [],
    body: undefined,
    stage: "Request",
    ...overrides,
  } as HttpMessage;
}

//
// Tests
//

describe("deleteHttpMessages", () => {
  it("deletes the stored messages by their keys", async () => {
    const first = makeRequest({ id: "msg-1", fetchRequestId: "req-1" });
    const second = makeRequest({ id: "msg-2", fetchRequestId: "req-2" });
    await storeHttpMessage(first, 1, "corr-1");
    await storeHttpMessage(second, 1, "corr-1");

    expect(await deleteHttpMessages([first], 1, "corr-1")).toBeUndefined();

    expect(await retrieveHttpMessages(1, "corr-1")).toEqual([second]);
  });

  it("does not delete messages stored under another session", async () => {
    const httpMessage = makeRequest();
    await storeHttpMessage(httpMessage, 1, "corr-1");
    await storeHttpMessage(httpMessage, 1, "corr-2");

    await deleteHttpMessages([httpMessage], 1, "corr-1");

    expect(await retrieveHttpMessages(1, "corr-1")).toEqual([]);
    expect(await retrieveHttpMessages(1, "corr-2")).toEqual([httpMessage]);
  });

  it("returns the error from the storage", async () => {
    const error = new Error("storage error");
    vi.mocked(removeSessionStorageItems).mockResolvedValue(error);

    expect(await deleteHttpMessages([makeRequest()], 1, "corr-1")).toBe(error);
  });
});
