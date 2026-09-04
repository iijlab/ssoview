/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newWatchStartedRecord, newWatchStoppedRecord } from "@/common/models/event-record.ts";
import { saveEventRecord } from "@/common/services/event-store.ts";
import { tabExists } from "@/common/utils/chrome-tabs.ts";
import {
  registerDebuggerDetachHandler,
  startDebugging,
  stopDebugging,
} from "@/service-worker/debugger-controller.ts";

export function registerWatchStopHandler(onWatchStopped: (tabId: number) => Promise<void>): void {
  registerDebuggerDetachHandler(async (tabId, reason) => {
    if (reason === "target_closed" && (await tabExists(tabId))) {
      // Possible Chrome bug: sometimes the tab is incorrectly detected as closed when it's still
      // open.
      console.info("Target still exists. Attempting to restart.");
      const startError = await startDebugging(tabId, true);
      if (startError) {
        console.warn("Failed to restart debugging:", { error: startError });
      } else {
        return;
      }
    }

    const saveError = await saveEventRecord(newWatchStoppedRecord(tabId));
    if (saveError) {
      console.warn("Failed to store the watch stopped event:", { error: saveError });
    }

    await onWatchStopped(tabId);
  });
}

export async function startWatching(tabId: number): Promise<void | Error> {
  const saveError = await saveEventRecord(newWatchStartedRecord(tabId));
  if (saveError) {
    return saveError;
  }

  const startError = await startDebugging(tabId);
  if (startError) {
    const saveError = await saveEventRecord(newWatchStoppedRecord(tabId));
    if (saveError) {
      console.warn("Failed to store the watch stopped event:", { error: saveError });
    }
    return startError;
  }
}

export async function stopWatching(tabId: number): Promise<void | Error> {
  const stopError = await stopDebugging(tabId);
  if (stopError) {
    return stopError;
  }

  const saveError = await saveEventRecord(newWatchStoppedRecord(tabId));
  if (saveError) {
    return new Error("Failed to store the watch stopped event", { cause: saveError });
  }
}
