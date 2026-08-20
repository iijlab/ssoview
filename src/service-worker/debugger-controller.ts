/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { isAttached } from "@/common/utils/chrome-debugger.ts";
import {
  newDebuggerAttachedRecord,
  newDebuggerDetachedRecord,
} from "@/service-worker/event-record.ts";
import { retrieveAllEventRecords, storeEventRecord } from "@/service-worker/event-store.ts";

// chrome.debugger.DetachReason is an enum, which is not compatible with the callback parameter
// type of chrome.debugger.onDetach.addListener. So we define our own type alias with the same
// values.
type DebuggerDetachReason = "canceled_by_user" | "target_closed";

export function registerDebuggerDetachHandler(
  onDebuggerDetached: (tabId: number, reason: DebuggerDetachReason) => Promise<void>,
): void {
  // Event fired when debugger is detached by Chrome.
  // Not fired when chrome.debugger.detach() is called.
  chrome.debugger.onDetach.addListener((source, reason) => {
    console.info("Debugger detached:", { source, reason });

    if (source.tabId === undefined) {
      // Nothing we can do without the tab ID
      return;
    }

    (async (tabId: number) => {
      const storeResult = await storeEventRecord(newDebuggerDetachedRecord(tabId, reason));
      if (storeResult instanceof Error) {
        console.warn("Failed to store the debugger detached event:", { error: storeResult });
      }

      await onDebuggerDetached(tabId, reason);
    })(source.tabId).catch((err) => {
      console.error("Unexpected error in debugger.onDetach event:", { error: err });
    });
  });
}

export async function isDebugging(tabId: number): Promise<boolean | Error> {
  // How the debugger record and the chrome.debugger API decide the result:
  //
  //   record   | chrome | result
  //   ---------+--------+-------
  //   attached | yes    | debugging
  //   attached | no     | not debugging -- the detach record was lost [1]
  //   detached | yes    | not debugging -- the record wins [2]
  //   detached | no     | not debugging
  //
  // [1] The record write was missed or incomplete, so the record alone cannot be trusted.
  // [2] The attachment may be DevTools or another extension. The attach record is reliable
  //     because a failed write triggers an immediate detach, so trust it here.

  const records = await retrieveAllEventRecords();
  if (records instanceof Error) {
    return records;
  }

  const latest = records.findLast(
    (r) => (r.type === "DebuggerAttached" || r.type === "DebuggerDetached") && r.tabId === tabId,
  );

  return latest !== undefined && latest.type === "DebuggerAttached" && (await isAttached(tabId));
}

export async function startDebugging(tabId: number, retry = false): Promise<void | Error> {
  const attached = await isAttached(tabId);
  if (attached instanceof Error) {
    return attached;
  } else if (attached) {
    return new Error("Monitoring already started");
  }

  const attachResult = await attachToTab(tabId);
  if (attachResult instanceof Error) {
    return attachResult;
  }

  const fetchResult = await enableFetch(tabId);
  if (fetchResult instanceof Error) {
    const detachResult = await detachFromTab(tabId);
    if (detachResult instanceof Error) {
      console.warn("Failed to detach from tab:", detachResult);
    }
    return fetchResult;
  }

  const storeResult = await storeEventRecord(newDebuggerAttachedRecord(tabId, retry));
  if (storeResult instanceof Error) {
    const detachResult = await detachFromTab(tabId);
    if (detachResult instanceof Error) {
      console.warn("Failed to detach from tab:", detachResult);
    }
    return storeResult;
  }
}

export async function stopDebugging(tabId: number): Promise<void | Error> {
  const detachResult = await detachFromTab(tabId);
  if (detachResult instanceof Error) {
    return new Error("Failed to detach from tab", { cause: detachResult });
  }

  const storeResult = await storeEventRecord(newDebuggerDetachedRecord(tabId));
  if (storeResult instanceof Error) {
    return new Error("Failed to store the debugger detached event", { cause: storeResult });
  }
}

async function attachToTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    return new Error("Failed to attach to debugger", { cause: err });
  }
}

async function detachFromTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    return new Error("Failed to detach from debugger", { cause: err });
  }
}

async function enableFetch(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ resourceType: "Document" }],
    });
  } catch (err) {
    return new Error("Failed to enable fetch", { cause: err });
  }
}
