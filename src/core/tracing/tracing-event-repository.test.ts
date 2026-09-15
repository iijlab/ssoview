/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  newDebuggingStartedEvent,
  newDebuggingStoppedEvent,
  newTabTracingStartedEvent,
  newTracingStartedEvent,
} from "@/core/tracing/tracing-event.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/shared/chrome-storage.ts";
import {
  findAllTracingLifecycleEvents,
  saveTracingLifecycleEvent,
} from "./tracing-event-repository.ts";

vi.mock("@/shared/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("saveTracingLifecycleEvent", () => {
  it("saves the event under a JSON key of the ID, kind, and type", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const event = newTracingStartedEvent();

    const result = await saveTracingLifecycleEvent(event);

    expect(result).toBeUndefined();
    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${event.id}","kind":"event","type":"TracingStarted"}`,
      event,
    );
  });

  it("includes the tab ID in the key for tab-scoped events", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const event = newTabTracingStartedEvent(42);

    await saveTracingLifecycleEvent(event);

    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${event.id}","kind":"event","type":"TabTracingStarted","tabId":42}`,
      event,
    );
  });

  it("excludes attributes other than the ID, kind, type, and tab ID from the key", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const event = newDebuggingStoppedEvent(7, "target_closed");

    await saveTracingLifecycleEvent(event);

    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(
      `{"id":"${event.id}","kind":"event","type":"DebuggingStopped","tabId":7}`,
      event,
    );
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("error");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await saveTracingLifecycleEvent(newTracingStartedEvent());

    expect(result).toBe(error);
  });
});

describe("findAllTracingLifecycleEvents", () => {
  it("retrieves events sorted by ID", async () => {
    const first = newTracingStartedEvent();
    const second = newTabTracingStartedEvent(1);
    const third = newDebuggingStartedEvent(1, false);
    const firstKey = `{"id":"${first.id}","kind":"event","type":"TracingStarted"}`;
    const secondKey = `{"id":"${second.id}","kind":"event","type":"TabTracingStarted","tabId":1}`;
    const thirdKey = `{"id":"${third.id}","kind":"event","type":"DebuggingStarted","tabId":1}`;
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([thirdKey, firstKey, secondKey]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [thirdKey]: third,
      [firstKey]: first,
      [secondKey]: second,
    });

    const result = await findAllTracingLifecycleEvents();

    expect(result).toEqual([first, second, third]);
  });

  it("requests only keys that are event keys", async () => {
    const event = newTracingStartedEvent();
    const key = `{"id":"${event.id}","kind":"event","type":"TracingStarted"}`;
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([
      "not-a-json-key",
      '"TracingStarted"',
      '{"id":"x","kind":"event","type":"TabClosed"}',
      '{"kind":"event","type":"TracingStarted"}',
      '{"id":"x","kind":"event","type":"TabTracingStarted","tabId":"42"}',
      '{"id":"x","kind":"httpMessage","type":"TracingStarted"}',
      key,
    ]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({ [key]: event });

    const result = await findAllTracingLifecycleEvents();

    expect(result).toEqual([event]);
    expect(getSessionStorageItems).toHaveBeenCalledExactlyOnceWith([key]);
  });

  it("returns an empty array when no event is saved", async () => {
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({});

    expect(await findAllTracingLifecycleEvents()).toEqual([]);
  });

  it("filters out values that are not events", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const event = newTracingStartedEvent();
    const key = `{"id":"${event.id}","kind":"event","type":"TracingStarted"}`;
    const brokenKey = '{"id":"broken","kind":"event","type":"TabTracingStarted","tabId":1}';
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([key, brokenKey]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [key]: event,
      [brokenKey]: { type: "TabTracingStarted" },
    });

    expect(await findAllTracingLifecycleEvents()).toEqual([event]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findAllTracingLifecycleEvents()).toBe(error);
  });

  it("propagates an error from the item retrieval", async () => {
    const error = new Error("error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([]);
    vi.mocked(getSessionStorageItems).mockResolvedValue(error);

    expect(await findAllTracingLifecycleEvents()).toBe(error);
  });
});
