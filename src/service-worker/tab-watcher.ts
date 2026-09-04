/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newWatchStartedRecord, newWatchStoppedRecord } from "@/common/models/event-record.ts";
import { findAllEventRecords, saveEventRecord } from "@/common/services/event-store.ts";
import { tabExists } from "@/common/utils/chrome-tabs.ts";
import {
  isDebugging,
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

export async function getWatchedTabIds(): Promise<number[] | Error> {
  // How the watch record and the debugging state decide the result, per tab:
  //
  //   record  | debugging | result
  //   --------+-----------+-------
  //   started | yes       | watched
  //   started | no        | not watched -- the stop record was lost [1]
  //   stopped | yes       | not watched -- the record wins [2]
  //   stopped | no        | not watched
  //
  // [1] The debugger is already gone, so nothing is being watched on that tab.
  // [2] The debugger is attached without a watch. The user can detach from the banner.

  const records = await findAllEventRecords();
  if (records instanceof Error) {
    return records;
  }

  const recordedWatchedTabIds = new Set<number>();
  for (const record of records) {
    if (record.type === "WatchStarted") {
      recordedWatchedTabIds.add(record.tabId);
    } else if (record.type === "WatchStopped") {
      recordedWatchedTabIds.delete(record.tabId);
    }
  }

  const actualWatchedTabIds: number[] = [];
  for (const tabId of recordedWatchedTabIds) {
    const debugging = await isDebugging(tabId);
    if (debugging instanceof Error) {
      return debugging;
    } else if (debugging) {
      actualWatchedTabIds.push(tabId);
    }
  }

  return actualWatchedTabIds;
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
