/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type CaptureSession } from "@/common/models/capture-session.ts";
import { type TracingLifecycleEvent } from "@/common/models/event-record.ts";
import { findAllTracingLifecycleEvents } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";

export async function getCaptureSession(
  captureSessionId: string,
): Promise<CaptureSession | undefined | Error> {
  const captureSessions = await getCaptureSessions();
  if (captureSessions instanceof Error) {
    return captureSessions;
  }

  return captureSessions.find((s) => s.id === captureSessionId);
}

export async function getCaptureSessions(): Promise<CaptureSession[] | Error> {
  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  return deriveCaptureSessions(tracingLifecycleEvents).toSorted((a, b) => (a.id < b.id ? 1 : -1));
}

function deriveCaptureSessions(tracingLifecycleEvents: TracingLifecycleEvent[]): CaptureSession[] {
  return tracingLifecycleEvents.reduce((captureSessions, event): CaptureSession[] => {
    switch (event.type) {
      case "TracingStarted":
        return [
          ...captureSessions,
          {
            id: event.id,
            imported: false,
            startedAt: event.recordedAt,
          },
        ];
      case "TracingStopped":
        return terminateLastOngoingCaptureSession(captureSessions, event.recordedAt);
      case "ArchiveImported":
        return [
          ...captureSessions,
          {
            id: event.id,
            imported: true,
            importedAt: event.recordedAt,
          },
        ];
      default:
        return captureSessions;
    }
  }, []);
}

function terminateLastOngoingCaptureSession(
  captureSessions: CaptureSession[],
  endedAt: string,
): CaptureSession[] {
  // Taking the last element is not enough: it may be an imported session.
  // Search backwards for the ongoing capture session.
  const ongoingCaptureSession = captureSessions.findLast(
    (s) => !s.imported && s.endedAt === undefined,
  );
  return ongoingCaptureSession === undefined
    ? captureSessions
    : captureSessions.map((s) =>
        s.id === ongoingCaptureSession.id ? { ...ongoingCaptureSession, endedAt } : s,
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

  const sessionId = await getOngoingCaptureSessionId();
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

export async function getOngoingCaptureSessionId(): Promise<string | undefined | Error> {
  const tracingLifecycleEvents = await findAllTracingLifecycleEvents();
  if (tracingLifecycleEvents instanceof Error) {
    return tracingLifecycleEvents;
  }

  const latest = tracingLifecycleEvents
    .filter((e) => e.type === "TracingStarted" || e.type === "TracingStopped")
    .at(-1);
  return latest?.type === "TracingStarted" ? latest.id : undefined;
}
