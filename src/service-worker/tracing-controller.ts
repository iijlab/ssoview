/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { newTracingStartedEvent, newTracingStoppedEvent } from "@/core/tracing/tracing-event.ts";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";
import {
  getOngoingTracingSessionId,
  getTracedTabIds,
  isTracing,
} from "@/core/tracing/tracing-state-query.ts";
import {
  registerTabTracingTerminatedHandler,
  startTabTracing,
  stopTabTracing,
} from "@/service-worker/tab-tracing-controller.ts";

export function registerTracingTerminatedHandler(
  onTracingTerminated: (tabId: number) => Promise<void>,
): void {
  registerTabTracingTerminatedHandler(async (tabId) => {
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

  const startError = await startTabTracing(tabId);
  if (startError) {
    const saveError = await saveTracingLifecycleEvent(newTracingStoppedEvent());
    if (saveError) {
      console.warn("Failed to save the tracing stopped event:", { error: saveError });
    }
    return startError;
  }
}

async function closeStaleTracing(): Promise<void | Error> {
  const tracingSessionId = await getOngoingTracingSessionId();
  if (tracingSessionId instanceof Error) {
    return tracingSessionId;
  }

  if (tracingSessionId !== undefined) {
    const tracedTabIds = await getTracedTabIds();
    if (tracedTabIds instanceof Error) {
      return tracedTabIds;
    }

    if (tracedTabIds.length === 0) {
      // No tab is being traced, so the tracing is stale. Write the stop event that went missing.
      return await saveTracingLifecycleEvent(newTracingStoppedEvent());
    }
  }
}

export async function stopTracing(tabId: number): Promise<void | Error> {
  const stopError = await stopTabTracing(tabId);
  if (stopError) {
    return stopError;
  }

  const saveError = await saveTracingLifecycleEvent(newTracingStoppedEvent());
  if (saveError) {
    return new Error("Failed to save the tracing stopped event", { cause: saveError });
  }
}
