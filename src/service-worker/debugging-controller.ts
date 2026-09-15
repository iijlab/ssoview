/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import {
  newDebuggingStartedEvent,
  newDebuggingStoppedEvent,
} from "@/core/tracing/tracing-event.ts";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";
import { isAttached } from "@/shared/chrome-debugger.ts";

// chrome.debugger.DetachReason is an enum, which is not compatible with the callback parameter
// type of chrome.debugger.onDetach.addListener. So we define our own type alias with the same
// values.
type DebuggerDetachReason = "canceled_by_user" | "target_closed";

export function registerDebuggingTerminatedHandler(
  onDebuggingTerminated: (tabId: number, reason: DebuggerDetachReason) => Promise<void>,
): void {
  // Event fired when debugger is detached by Chrome.
  // Not fired when chrome.debugger.detach() is called.
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === undefined) {
      console.warn("Unexpected debuggee without tab ID:", { source, reason });
      // Nothing we can do without the tab ID
      return;
    }

    (async (tabId: number) => {
      const saveError = await saveTracingLifecycleEvent(newDebuggingStoppedEvent(tabId, reason));
      if (saveError) {
        console.warn("Failed to save the debugging stopped event:", { error: saveError });
      }

      await onDebuggingTerminated(tabId, reason);
    })(source.tabId).catch((err) => {
      console.error("Unexpected error in debugger.onDetach event:", { error: err });
    });
  });
}

export async function startDebugging(tabId: number, isRetry = false): Promise<void | Error> {
  const attached = await isAttached(tabId);
  if (attached instanceof Error) {
    return attached;
  } else if (attached) {
    return new Error("Debugging already started");
  }

  const attachError = await attachToTab(tabId);
  if (attachError) {
    return attachError;
  }

  const enableFetchError = await enableFetch(tabId);
  if (enableFetchError) {
    const detachError = await detachFromTab(tabId);
    if (detachError) {
      console.warn("Failed to detach from tab:", detachError);
    }
    return enableFetchError;
  }

  const saveError = await saveTracingLifecycleEvent(newDebuggingStartedEvent(tabId, isRetry));
  if (saveError) {
    const detachError = await detachFromTab(tabId);
    if (detachError) {
      console.warn("Failed to detach from tab:", detachError);
    }
    return saveError;
  }
}

export async function stopDebugging(tabId: number): Promise<void | Error> {
  const detachError = await detachFromTab(tabId);
  if (detachError) {
    return new Error("Failed to detach from tab", { cause: detachError });
  }

  const saveError = await saveTracingLifecycleEvent(newDebuggingStoppedEvent(tabId));
  if (saveError) {
    return new Error("Failed to save the debugging stopped event", { cause: saveError });
  }
}

async function attachToTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (err) {
    return new Error("Failed to attach to debugger", { cause: err });
  }
}

async function detachFromTab(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch (err) {
    return new Error("Failed to detach from debugger", { cause: err });
  }
}

async function enableFetch(tabId: number): Promise<void | Error> {
  try {
    await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
      patterns: [{ resourceType: "Document" }],
    });
  } catch (err) {
    return new Error("Failed to enable fetch", { cause: err });
  }
}
