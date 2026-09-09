/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type TracingSession } from "@/common/models/capture-session.ts";
import { type TracingLifecycleEvent } from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";

export async function getTracingSession(
  tracingSessionId: string,
): Promise<TracingSession | undefined | Error> {
  const tracingSessions = await getTracingSessions();
  if (tracingSessions instanceof Error) {
    return tracingSessions;
  }

  return tracingSessions.find((s) => s.id === tracingSessionId);
}

export async function getTracingSessions(): Promise<TracingSession[] | Error> {
  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  return deriveTracingSessions(tracingLifecycleEvents).toSorted((a, b) => (a.id < b.id ? 1 : -1));
}

function deriveTracingSessions(tracingLifecycleEvents: TracingLifecycleEvent[]): TracingSession[] {
  return tracingLifecycleEvents.reduce((tracingSessions, event): TracingSession[] => {
    switch (event.type) {
      case "TracingStarted":
        return [
          ...tracingSessions,
          {
            id: event.id,
            imported: false,
            startedAt: event.recordedAt,
          },
        ];
      case "TracingStopped":
        return terminateLastOngoingTracingSession(tracingSessions, event.recordedAt);
      case "ArchiveImported":
        return [
          ...tracingSessions,
          {
            id: event.id,
            imported: true,
            importedAt: event.recordedAt,
          },
        ];
      default:
        return tracingSessions;
    }
  }, []);
}

function terminateLastOngoingTracingSession(
  tracingSessions: TracingSession[],
  endedAt: string,
): TracingSession[] {
  // Taking the last element is not enough: it may be an imported session.
  // Search backwards for the ongoing tracing session.
  const ongoingTracingSession = tracingSessions.findLast(
    (s) => !s.imported && s.endedAt === undefined,
  );
  return ongoingTracingSession === undefined
    ? tracingSessions
    : tracingSessions.map((s) =>
        s.id === ongoingTracingSession.id ? { ...ongoingTracingSession, endedAt } : s,
      );
}

export async function isCapturing(): Promise<boolean | Error> {
  // How the capture event and the watched tabs decide the result:
  //
  //   event  | watched tab | result
  //   -------+-------------+-------
  //   open   | yes         | capturing
  //   open   | no          | not capturing -- the stop event was lost [1]
  //   closed | yes         | not capturing -- the event wins [2]
  //   closed | no          | not capturing
  //
  // [1] The debugger is already detached, so staying "capturing" would show a recording that can
  //     never be stopped.
  // [2] The user can detach from the banner.

  const sessionId = await getOngoingTracingSessionId();
  if (sessionId instanceof Error) {
    return sessionId;
  } else if (sessionId === undefined) {
    return false;
  }

  const tabIds = await getWatchedTabIds();
  if (tabIds instanceof Error) {
    return tabIds;
  }

  return 0 < tabIds.length;
}

export async function getOngoingTracingSessionId(): Promise<string | undefined | Error> {
  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const latest = tracingLifecycleEvents
    .filter((e) => e.type === "TracingStarted" || e.type === "TracingStopped")
    .at(-1);
  return latest?.type === "TracingStarted" ? latest.id : undefined;
}
