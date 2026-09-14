/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type TracingSession } from "@/common/models/capture-session.ts";
import { type TracingLifecycleEvent } from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";

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
