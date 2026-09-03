/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage, type HttpResponse } from "@/common/models/http-message.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import {
  deleteHttpMessages,
  findHttpMessagesByIds,
  findPairedHttpRequest,
  saveHttpMessage,
} from "./http-store.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  removeSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

//
// Helpers
//

function makeRequest(overrides: Record<string, unknown> = {}): HttpMessage {
  return {
    id: "msg-1",
    captureSessionId: "cs-1",
    createdAt: "2026-01-01T00:00:00Z",
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

function makeResponse(overrides: Record<string, unknown> = {}): HttpResponse {
  return {
    ...makeRequest({ id: "msg-2", stage: "Response" }),
    statusCode: 200,
    pairedHttpRequestId: "msg-1",
    ...overrides,
  } as HttpResponse;
}

function keyOf(httpMessage: HttpMessage): string {
  const { id, captureSessionId, tabId, fetchRequestId, stage } = httpMessage;
  const observation =
    tabId === undefined ? "" : `"tabId":${tabId},"fetchRequestId":"${fetchRequestId}",`;
  return `{"id":"${id}","kind":"http","captureSessionId":"${captureSessionId}",${observation}"stage":"${stage}"}`;
}

// Puts the messages into the mocked storage, in the given order of keys
function mockStorage(...httpMessages: HttpMessage[]): void {
  const items = Object.fromEntries(httpMessages.map((m) => [keyOf(m), m]));
  vi.mocked(getAllSessionStorageKeys).mockResolvedValue(Object.keys(items));
  vi.mocked(getSessionStorageItems).mockImplementation(async (keys) =>
    Object.fromEntries(keys.filter((k) => k in items).map((k) => [k, items[k]])),
  );
}

//
// Tests
//

describe("saveHttpMessage", () => {
  it("stores the message under a JSON key of the ID, kind, capture session, tab, request ID, and stage", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const httpMessage = makeRequest();

    const result = await saveHttpMessage(httpMessage);

    expect(result).toBeUndefined();
    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      '{"id":"msg-1","kind":"http","captureSessionId":"cs-1","tabId":1,"fetchRequestId":"req-1","stage":"Request"}',
      httpMessage,
    );
  });

  it("omits the tab and request ID from the key when the message has none", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const httpMessage = makeRequest({ tabId: undefined, fetchRequestId: undefined });

    await saveHttpMessage(httpMessage);

    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      '{"id":"msg-1","kind":"http","captureSessionId":"cs-1","stage":"Request"}',
      httpMessage,
    );
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage failed");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    expect(await saveHttpMessage(makeRequest())).toBe(error);
  });
});

describe("findHttpMessagesByIds", () => {
  it("returns the messages of the given IDs in ID order", async () => {
    const first = makeRequest({ id: "msg-1" });
    const second = makeRequest({ id: "msg-2" });
    mockStorage(second, makeRequest({ id: "msg-3" }), first);

    const result = await findHttpMessagesByIds(["msg-2", "msg-1"]);

    expect(result).toEqual([first, second]);
  });

  it("returns an empty array when no IDs are given", async () => {
    mockStorage(makeRequest());

    expect(await findHttpMessagesByIds([])).toEqual([]);
    expect(getSessionStorageItems).toHaveBeenCalledWith([]);
  });

  it("ignores keys of other kinds", async () => {
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([
      '{"id":"msg-1","kind":"trace","tabId":1,"flowId":"flow-1"}',
    ]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({});

    await findHttpMessagesByIds(["msg-1"]);

    expect(getSessionStorageItems).toHaveBeenCalledWith([]);
  });

  it("skips invalid values with a warning", async () => {
    const key = keyOf(makeRequest());
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([key]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({ [key]: { id: "msg-1" } });

    expect(await findHttpMessagesByIds(["msg-1"])).toEqual([]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("propagates an error from listing the keys", async () => {
    const error = new Error("keys failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findHttpMessagesByIds(["msg-1"])).toBe(error);
  });

  it("propagates an error from reading the items", async () => {
    const error = new Error("items failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([]);
    vi.mocked(getSessionStorageItems).mockResolvedValue(error);

    expect(await findHttpMessagesByIds(["msg-1"])).toBe(error);
  });
});

describe("findPairedHttpRequest", () => {
  it("returns the request of the same capture session, tab, and request ID", async () => {
    const request = makeRequest();
    mockStorage(request);

    expect(await findPairedHttpRequest(makeResponse())).toEqual(request);
  });

  it("ignores requests of another capture session, tab, or request ID", async () => {
    mockStorage(
      makeRequest({ id: "msg-3", captureSessionId: "cs-2" }),
      makeRequest({ id: "msg-4", tabId: 2 }),
      makeRequest({ id: "msg-5", fetchRequestId: "req-2" }),
    );

    expect(await findPairedHttpRequest(makeResponse())).toBeUndefined();
  });

  it("ignores responses", async () => {
    const response = makeResponse();
    mockStorage(response);

    expect(await findPairedHttpRequest(response)).toBeUndefined();
  });

  it("returns undefined without reading the storage when the response has no tab", async () => {
    const response = makeResponse({ tabId: undefined, fetchRequestId: undefined });

    expect(await findPairedHttpRequest(response)).toBeUndefined();
    expect(getAllSessionStorageKeys).not.toHaveBeenCalled();
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("keys failed");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findPairedHttpRequest(makeResponse())).toBe(error);
  });
});

describe("deleteHttpMessages", () => {
  it("removes the messages by their keys", async () => {
    vi.mocked(removeSessionStorageItems).mockResolvedValue(undefined);
    const request = makeRequest();
    const response = makeResponse();

    expect(await deleteHttpMessages([request, response])).toBeUndefined();
    expect(removeSessionStorageItems).toHaveBeenCalledExactlyOnceWith([
      keyOf(request),
      keyOf(response),
    ]);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("remove failed");
    vi.mocked(removeSessionStorageItems).mockResolvedValue(error);

    expect(await deleteHttpMessages([makeRequest()])).toBe(error);
  });
});
