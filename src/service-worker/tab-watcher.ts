/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { tabExists } from "@/common/utils/chrome-tabs.ts";
import {
  isDebugging,
  registerDebuggerDetachHandler,
  startDebugging,
  stopDebugging,
} from "@/service-worker/debugger-controller.ts";
import { newWatchStartedRecord, newWatchStoppedRecord } from "@/common/models/event-record.ts";
import { retrieveAllEventRecords, storeEventRecord } from "@/common/services/event-store.ts";

export function registerWatchStopHandler(onWatchStopped: (tabId: number) => Promise<void>): void {
  registerDebuggerDetachHandler(async (tabId, reason) => {
    if (reason === "target_closed" && (await tabExists(tabId))) {
      // Possible Chrome bug: sometimes the tab is incorrectly detected as closed when it's still
      // open.
      console.info("Target still exists. Attempting to restart.");
      const result = await startDebugging(tabId, true);
      if (result instanceof Error) {
        console.warn("Failed to restart debugging:", { error: result });
      } else {
        return;
      }
    }

    const storeResult = await storeEventRecord(newWatchStoppedRecord(tabId));
    if (storeResult instanceof Error) {
      console.warn("Failed to store the watch stopped event:", { error: storeResult });
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

  const records = await retrieveAllEventRecords();
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

export async function isWatching(tabId: number): Promise<boolean | Error> {
  const tabIds = await getWatchedTabIds();
  if (tabIds instanceof Error) {
    return tabIds;
  }

  return tabIds.includes(tabId);
}

export async function startWatching(tabId: number): Promise<void | Error> {
  const startedResult = await storeEventRecord(newWatchStartedRecord(tabId));
  if (startedResult instanceof Error) {
    return startedResult;
  }

  const debuggingResult = await startDebugging(tabId);
  if (debuggingResult instanceof Error) {
    const stoppedResult = await storeEventRecord(newWatchStoppedRecord(tabId));
    if (stoppedResult instanceof Error) {
      console.warn("Failed to store the watch stopped event:", { error: stoppedResult });
    }
    return debuggingResult;
  }
}

export async function stopWatching(tabId: number): Promise<void | Error> {
  const debuggingResult = await stopDebugging(tabId);
  if (debuggingResult instanceof Error) {
    return debuggingResult;
  }

  const stoppedResult = await storeEventRecord(newWatchStoppedRecord(tabId));
  if (stoppedResult instanceof Error) {
    return new Error("Failed to store the watch stopped event", { cause: stoppedResult });
  }
}
