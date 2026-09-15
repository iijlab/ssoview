/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  newTabTracingStartedEvent,
  newTabTracingStoppedEvent,
} from "@/core/tracing/tracing-event.ts";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";
import {
  registerDebuggingTerminatedHandler,
  startDebugging,
  stopDebugging,
} from "@/service-worker/debugging-controller.ts";
import { tabExists } from "@/shared/chrome-tabs.ts";

export function registerTabTracingTerminatedHandler(
  onTabTracingTerminated: (tabId: number) => Promise<void>,
): void {
  registerDebuggingTerminatedHandler(async (tabId, reason) => {
    if (reason === "target_closed" && (await tabExists(tabId))) {
      // Possible Chrome bug: sometimes the tab is incorrectly detected as closed when it's still
      // open.
      console.info("Target still exists. Attempting to restart.");
      const startError = await startDebugging(tabId, true);
      if (startError) {
        console.warn("Failed to restart debugging:", { error: startError });
      } else {
        return;
      }
    }

    const saveError = await saveTracingLifecycleEvent(newTabTracingStoppedEvent(tabId));
    if (saveError) {
      console.warn("Failed to save the tab tracing stopped event:", { error: saveError });
    }

    await onTabTracingTerminated(tabId);
  });
}

export async function startTabTracing(tabId: number): Promise<void | Error> {
  const saveError = await saveTracingLifecycleEvent(newTabTracingStartedEvent(tabId));
  if (saveError) {
    return saveError;
  }

  const startError = await startDebugging(tabId);
  if (startError) {
    const saveError = await saveTracingLifecycleEvent(newTabTracingStoppedEvent(tabId));
    if (saveError) {
      console.warn("Failed to save the tab tracing stopped event:", { error: saveError });
    }
    return startError;
  }
}

export async function stopTabTracing(tabId: number): Promise<void | Error> {
  const stopError = await stopDebugging(tabId);
  if (stopError) {
    return stopError;
  }

  const saveError = await saveTracingLifecycleEvent(newTabTracingStoppedEvent(tabId));
  if (saveError) {
    return new Error("Failed to save the tab tracing stopped event", { cause: saveError });
  }
}
