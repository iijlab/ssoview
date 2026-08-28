/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type { CaptureSession } from "@/common/models/capture-session.ts";
import type { EventRecord } from "@/common/models/event-record.ts";
import { findAllEventRecords } from "@/common/services/event-store.ts";

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
  const eventRecords = await findAllEventRecords();
  if (eventRecords instanceof Error) {
    return eventRecords;
  }

  return deriveCaptureSessions(eventRecords).toSorted((a, b) => (a.id < b.id ? 1 : -1));
}

function deriveCaptureSessions(eventRecords: EventRecord[]): CaptureSession[] {
  return eventRecords.reduce((captureSessions, eventRecord): CaptureSession[] => {
    switch (eventRecord.type) {
      case "CaptureStarted":
        return [
          ...captureSessions,
          {
            id: eventRecord.id,
            imported: false,
            startedAt: eventRecord.date,
          },
        ];
      case "CaptureStopped":
        return terminateLastOngoingCaptureSession(captureSessions, eventRecord.date);
      case "ArchiveImported":
        return [
          ...captureSessions,
          {
            id: eventRecord.id,
            imported: true,
            importedAt: eventRecord.date,
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
