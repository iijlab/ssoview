/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { findAllEventRecords } from "@/common/services/event-store.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";

export async function isWatching(tabId: number): Promise<boolean | Error> {
  const tabIds = await getWatchedTabIds();
  if (tabIds instanceof Error) {
    return tabIds;
  }

  return tabIds.includes(tabId);
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

async function isDebugging(tabId: number): Promise<boolean | Error> {
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

  const records = await findAllEventRecords();
  if (records instanceof Error) {
    return records;
  }

  const latest = records.findLast(
    (r) => (r.type === "DebuggerAttached" || r.type === "DebuggerDetached") && r.tabId === tabId,
  );

  return latest !== undefined && latest.type === "DebuggerAttached" && (await isAttached(tabId));
}
