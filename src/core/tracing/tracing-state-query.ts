/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { findAllTracingLifecycleEvents } from "@/core/tracing/tracing-event-repository.ts";
import { isAttached } from "@/shared/chrome-debugger.ts";

export async function isTracing(): Promise<boolean | Error> {
  // How the tracing event and the traced tabs decide the result:
  //
  //   event  | traced tab  | result
  //   -------+-------------+-------
  //   open   | yes         | tracing
  //   open   | no          | not tracing -- the stop event was lost [1]
  //   closed | yes         | not tracing -- the event wins [2]
  //   closed | no          | not tracing
  //
  // [1] The debugger is already detached, so staying "tracing" would show a recording that can
  //     never be stopped.
  // [2] The user can detach from the banner.

  const tracingSessionId = await getOngoingTracingSessionId();
  if (tracingSessionId instanceof Error) {
    return tracingSessionId;
  } else if (tracingSessionId === undefined) {
    return false;
  }

  const tracedTabIds = await getTracedTabIds();
  if (tracedTabIds instanceof Error) {
    return tracedTabIds;
  }

  return 0 < tracedTabIds.length;
}

export async function getOngoingTracingSessionId(): Promise<string | undefined | Error> {
  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const latestTracingEvent = tracingLifecycleEvents
    .filter((e) => e.type === "TracingStarted" || e.type === "TracingStopped")
    .at(-1);
  return latestTracingEvent?.type === "TracingStarted" ? latestTracingEvent.id : undefined;
}

export async function isTracedTab(tabId: number): Promise<boolean | Error> {
  const tracedTabIds = await getTracedTabIds();
  if (tracedTabIds instanceof Error) {
    return tracedTabIds;
  }

  return tracedTabIds.includes(tabId);
}

export async function getTracedTabIds(): Promise<number[] | Error> {
  // How the tab tracing event and the debugging state decide the result, per tab:
  //
  //   event   | debugging | result
  //   --------+-----------+-------
  //   started | yes       | traced
  //   started | no        | not traced -- the stop event was lost [1]
  //   stopped | yes       | not traced -- the event wins [2]
  //   stopped | no        | not traced
  //
  // [1] The debugger is already gone, so the tab is not being traced.
  // [2] The debugger is attached without tab tracing. The user can detach from the banner.

  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const recordedTracedTabIds = new Set<number>();
  for (const event of tracingLifecycleEvents) {
    if (event.type === "TabTracingStarted") {
      recordedTracedTabIds.add(event.tabId);
    } else if (event.type === "TabTracingStopped") {
      recordedTracedTabIds.delete(event.tabId);
    }
  }

  const actualTracedTabIds: number[] = [];
  for (const tabId of recordedTracedTabIds) {
    const debugging = await isDebugging(tabId);
    if (debugging instanceof Error) {
      return debugging;
    } else if (debugging) {
      actualTracedTabIds.push(tabId);
    }
  }

  return actualTracedTabIds;
}

async function isDebugging(tabId: number): Promise<boolean | Error> {
  // How the debugging event and the chrome.debugger API decide the result:
  //
  //   event   | chrome | result
  //   --------+--------+-------
  //   started | yes    | debugging
  //   started | no     | not debugging -- the stop event was lost [1]
  //   stopped | yes    | not debugging -- the event wins [2]
  //   stopped | no     | not debugging
  //
  // [1] The event write was missed or incomplete, so the event alone cannot be trusted.
  // [2] The attachment may be DevTools or another extension. The start event is reliable
  //     because a failed write triggers an immediate detach, so trust it here.

  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const latestDebuggingEvent = tracingLifecycleEvents.findLast(
    (e) => (e.type === "DebuggingStarted" || e.type === "DebuggingStopped") && e.tabId === tabId,
  );

  return (
    latestDebuggingEvent !== undefined &&
    latestDebuggingEvent.type === "DebuggingStarted" &&
    (await isAttached(tabId))
  );
}
