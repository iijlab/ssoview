/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newCaptureStartedRecord, newCaptureStoppedRecord } from "@/common/models/event-record.ts";
import { getOngoingCaptureSessionId, isCapturing } from "@/common/services/capture-query.ts";
import { saveEventRecord } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";
import {
  registerWatchStopHandler,
  startWatching,
  stopWatching,
} from "@/service-worker/tab-watcher.ts";

export function registerCaptureStopHandler(
  onCaptureStopped: (tabId: number) => Promise<void>,
): void {
  registerWatchStopHandler(async (tabId) => {
    const saveError = await saveEventRecord(newCaptureStoppedRecord());
    if (saveError) {
      console.warn("Failed to store the capture stopped event:", { error: saveError });
    }

    await onCaptureStopped(tabId);
  });
}

export async function startCapturing(tabId: number): Promise<void | Error> {
  const closeError = await closeInconsistentCapture();
  if (closeError) {
    return closeError;
  }

  const capturing = await isCapturing();
  if (capturing instanceof Error) {
    return capturing;
  } else if (capturing) {
    console.info("Capture already in progress");
    return;
  }

  const saveError = await saveEventRecord(newCaptureStartedRecord());
  if (saveError) {
    return saveError;
  }

  const startError = await startWatching(tabId);
  if (startError) {
    const saveError = await saveEventRecord(newCaptureStoppedRecord());
    if (saveError) {
      console.warn("Failed to store the capture stopped event:", { error: saveError });
    }
    return startError;
  }
}

async function closeInconsistentCapture(): Promise<void | Error> {
  const sessionId = await getOngoingCaptureSessionId();
  if (sessionId instanceof Error) {
    return sessionId;
  }

  if (sessionId !== undefined) {
    const watchedTabIds = await getWatchedTabIds();
    if (watchedTabIds instanceof Error) {
      return watchedTabIds;
    }

    if (watchedTabIds.length === 0) {
      // No tab is being watched, so the capture is stale. Write the stop record that went missing.
      return await saveEventRecord(newCaptureStoppedRecord());
    }
  }
}

export async function stopCapturing(tabId: number): Promise<void | Error> {
  const stopError = await stopWatching(tabId);
  if (stopError) {
    return stopError;
  }

  const saveError = await saveEventRecord(newCaptureStoppedRecord());
  if (saveError) {
    return new Error("Failed to store the capture stopped event", { cause: saveError });
  }
}
