/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newTracingStartedEvent, newTracingStoppedEvent } from "@/common/models/event-record.ts";
import { getOngoingTracingSessionId, isTracing } from "@/common/services/capture-query.ts";
import { saveTracingLifecycleEvent } from "@/common/services/event-store.ts";
import { getWatchedTabIds } from "@/common/services/watch-query.ts";
import {
  registerWatchStopHandler,
  startWatching,
  stopWatching,
} from "@/service-worker/tab-watcher.ts";

export function registerTracingTerminatedHandler(
  onTracingTerminated: (tabId: number) => Promise<void>,
): void {
  registerWatchStopHandler(async (tabId) => {
    const saveError = await saveTracingLifecycleEvent(newTracingStoppedEvent());
    if (saveError) {
      console.warn("Failed to save the tracing stopped event:", { error: saveError });
    }

    await onTracingTerminated(tabId);
  });
}

export async function startTracing(tabId: number): Promise<void | Error> {
  const closeError = await closeStaleTracing();
  if (closeError) {
    return closeError;
  }

  const tracing = await isTracing();
  if (tracing instanceof Error) {
    return tracing;
  } else if (tracing) {
    console.info("Tracing already in progress");
    return;
  }

  const saveError = await saveTracingLifecycleEvent(newTracingStartedEvent());
  if (saveError) {
    return saveError;
  }

  const startError = await startWatching(tabId);
  if (startError) {
    const saveError = await saveTracingLifecycleEvent(newTracingStoppedEvent());
    if (saveError) {
      console.warn("Failed to save the tracing stopped event:", { error: saveError });
    }
    return startError;
  }
}

async function closeStaleTracing(): Promise<void | Error> {
  const sessionId = await getOngoingTracingSessionId();
  if (sessionId instanceof Error) {
    return sessionId;
  }

  if (sessionId !== undefined) {
    const watchedTabIds = await getWatchedTabIds();
    if (watchedTabIds instanceof Error) {
      return watchedTabIds;
    }

    if (watchedTabIds.length === 0) {
      // No tab is being watched, so the tracing is stale. Write the stop event that went missing.
      return await saveTracingLifecycleEvent(newTracingStoppedEvent());
    }
  }
}

export async function stopTracing(tabId: number): Promise<void | Error> {
  const stopError = await stopWatching(tabId);
  if (stopError) {
    return stopError;
  }

  const saveError = await saveTracingLifecycleEvent(newTracingStoppedEvent());
  if (saveError) {
    return new Error("Failed to save the tracing stopped event", { cause: saveError });
  }
}
