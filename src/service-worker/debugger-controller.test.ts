/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
} from "@/common/models/event-record.ts";
import { findAllEventRecords, saveEventRecord } from "@/common/services/event-store.ts";
import {
  isDebugging,
  registerDebuggerDetachHandler,
  startDebugging,
  stopDebugging,
} from "./debugger-controller.ts";

vi.mock("@/common/services/event-store.ts", () => ({
  findAllEventRecords: vi.fn(),
  saveEventRecord: vi.fn(),
}));

//
// Helpers
//

type DebuggerDetachListener = (source: chrome.debugger.Debuggee, reason: string) => void;

const detachListeners: DebuggerDetachListener[] = [];
const sendCommand = vi.fn();
const getTargets = vi.fn();
const attach = vi.fn();
const detach = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  detachListeners.length = 0;
  sendCommand.mockReset();
  getTargets.mockReset().mockResolvedValue([]);
  attach.mockReset();
  detach.mockReset();
  vi.mocked(saveEventRecord).mockReset().mockResolvedValue(undefined);
  vi.mocked(findAllEventRecords).mockReset().mockResolvedValue([]);
  vi.stubGlobal("chrome", {
    debugger: {
      onDetach: {
        addListener: (listener: DebuggerDetachListener) => detachListeners.push(listener),
      },
      sendCommand,
      getTargets,
      attach,
      detach,
    },
  });
});

function fireDebuggerDetach(source: chrome.debugger.Debuggee, reason: string): void {
  const listener = detachListeners[0];
  if (listener === undefined) {
    throw new Error("No debugger detach listener is registered");
  }

  listener(source, reason);
}

//
// Tests
//

describe("registerDebuggerDetachHandler", () => {
  it("stores a DebuggerDetached record with the reason and calls the handler", async () => {
    const onDebuggerDetached = vi.fn();
    registerDebuggerDetachHandler(onDebuggerDetached);

    fireDebuggerDetach({ tabId: 1 }, "canceled_by_user");

    await vi.waitFor(() =>
      expect(onDebuggerDetached).toHaveBeenCalledExactlyOnceWith(1, "canceled_by_user"),
    );
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "DebuggerDetached",
        tabId: 1,
        detachedBy: "chrome",
        detachReason: "canceled_by_user",
      }),
    );
  });

  it("calls the handler even when the record cannot be stored", async () => {
    vi.mocked(saveEventRecord).mockResolvedValue(new Error("storage failed"));
    const onDebuggerDetached = vi.fn();
    registerDebuggerDetachHandler(onDebuggerDetached);

    fireDebuggerDetach({ tabId: 1 }, "target_closed");

    await vi.waitFor(() =>
      expect(onDebuggerDetached).toHaveBeenCalledExactlyOnceWith(1, "target_closed"),
    );
    expect(console.warn).toHaveBeenCalled();
  });

  it("ignores a detach without a tab ID", async () => {
    const onDebuggerDetached = vi.fn();
    registerDebuggerDetachHandler(onDebuggerDetached);

    fireDebuggerDetach({ targetId: "x" }, "target_closed");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onDebuggerDetached).not.toHaveBeenCalled();
    expect(saveEventRecord).not.toHaveBeenCalled();
  });
});

describe("startDebugging", () => {
  it("stores a DebuggerAttached record after attaching and enabling Fetch", async () => {
    const result = await startDebugging(1);

    expect(result).toBeUndefined();
    expect(attach).toHaveBeenCalledExactlyOnceWith({ tabId: 1 }, "1.3");
    expect(sendCommand).toHaveBeenCalledExactlyOnceWith(
      { tabId: 1 },
      "Fetch.enable",
      expect.anything(),
    );
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "DebuggerAttached", tabId: 1, retry: false }),
    );
  });

  it("stores nothing when attaching fails", async () => {
    attach.mockRejectedValue(new Error("Cannot attach to this target"));

    const result = await startDebugging(1);

    expect(result).toBeInstanceOf(Error);
    expect(sendCommand).not.toHaveBeenCalled();
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("detaches and stores nothing when Fetch cannot be enabled", async () => {
    sendCommand.mockRejectedValue(new Error("Debugger is not attached to the tab"));

    const result = await startDebugging(1);

    expect(result).toBeInstanceOf(Error);
    expect(detach).toHaveBeenCalledExactlyOnceWith({ tabId: 1 });
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("detaches and returns the error when the record cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    const result = await startDebugging(1);

    expect(result).toBe(error);
    expect(detach).toHaveBeenCalledExactlyOnceWith({ tabId: 1 });
  });
});

describe("stopDebugging", () => {
  it("stores a DebuggerDetached record by self after detaching", async () => {
    const result = await stopDebugging(1);

    expect(result).toBeUndefined();
    expect(detach).toHaveBeenCalledExactlyOnceWith({ tabId: 1 });
    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "DebuggerDetached", tabId: 1, detachedBy: "self" }),
    );
    expect(vi.mocked(saveEventRecord).mock.calls[0]?.[0]).not.toHaveProperty("detachReason");
  });

  it("stores nothing when detaching fails", async () => {
    detach.mockRejectedValue(new Error("Debugger is not attached to the tab"));

    const result = await stopDebugging(1);

    expect(result).toBeInstanceOf(Error);
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("returns an error when the record cannot be stored after detaching", async () => {
    const error = new Error("storage failed");
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    const result = await stopDebugging(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).cause).toBe(error);
    expect(detach).toHaveBeenCalledOnce();
  });
});

describe("isDebugging", () => {
  it("returns true when the tab is attached and the records say so", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newDebuggerAttachedRecord(1, false)]);
    getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    expect(await isDebugging(1)).toBe(true);
  });

  it("returns false when no record says the tab was attached", async () => {
    getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    expect(await isDebugging(1)).toBe(false);
  });

  it("returns false when the latest record is a detach", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newDebuggerAttachedRecord(1, false),
      newDebuggerDetachedRecord(1),
    ]);
    getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    expect(await isDebugging(1)).toBe(false);
  });

  it("returns true when the tab was re-attached after a detach", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([
      newDebuggerAttachedRecord(1, false),
      newDebuggerDetachedRecord(1),
      newDebuggerAttachedRecord(1, true),
    ]);
    getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    expect(await isDebugging(1)).toBe(true);
  });

  it("returns false when the records say so but the tab is no longer attached", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newDebuggerAttachedRecord(1, false)]);
    getTargets.mockResolvedValue([]);

    expect(await isDebugging(1)).toBe(false);
  });

  it("ignores records of other tabs", async () => {
    vi.mocked(findAllEventRecords).mockResolvedValue([newDebuggerAttachedRecord(2, false)]);
    getTargets.mockResolvedValue([{ tabId: 1, attached: true }]);

    expect(await isDebugging(1)).toBe(false);
  });

  it("returns the error when the records cannot be retrieved", async () => {
    const error = new Error("storage failed");
    vi.mocked(findAllEventRecords).mockResolvedValue(error);

    expect(await isDebugging(1)).toBe(error);
  });
});
