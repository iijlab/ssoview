/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";

export async function isWatching(tabId: number): Promise<boolean | Error> {
  const tabIds = await getWatchedTabIds();
  if (tabIds instanceof Error) {
    return tabIds;
  }

  return tabIds.includes(tabId);
}

export async function getWatchedTabIds(): Promise<number[] | Error> {
  // How the watch event and the debugging state decide the result, per tab:
  //
  //   event   | debugging | result
  //   --------+-----------+-------
  //   started | yes       | watched
  //   started | no        | not watched -- the stop event was lost [1]
  //   stopped | yes       | not watched -- the event wins [2]
  //   stopped | no        | not watched
  //
  // [1] The debugger is already gone, so nothing is being watched on that tab.
  // [2] The debugger is attached without a watch. The user can detach from the banner.

  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const recordedWatchedTabIds = new Set<number>();
  for (const event of tracingLifecycleEvents) {
    if (event.type === "TabTracingStarted") {
      recordedWatchedTabIds.add(event.tabId);
    } else if (event.type === "TabTracingStopped") {
      recordedWatchedTabIds.delete(event.tabId);
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
  // How the debugger event and the chrome.debugger API decide the result:
  //
  //   event    | chrome | result
  //   ---------+--------+-------
  //   attached | yes    | debugging
  //   attached | no     | not debugging -- the detach event was lost [1]
  //   detached | yes    | not debugging -- the event wins [2]
  //   detached | no     | not debugging
  //
  // [1] The event write was missed or incomplete, so the event alone cannot be trusted.
  // [2] The attachment may be DevTools or another extension. The attach event is reliable
  //     because a failed write triggers an immediate detach, so trust it here.

  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const latest = tracingLifecycleEvents.findLast(
    (e) => (e.type === "DebuggingStarted" || e.type === "DebuggingStopped") && e.tabId === tabId,
  );

  return latest !== undefined && latest.type === "DebuggingStarted" && (await isAttached(tabId));
}
