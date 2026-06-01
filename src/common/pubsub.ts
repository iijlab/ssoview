/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// PubSub: inter-component communication of the following type
// - no response required
// - multiple receivers

import { isObject } from "@/common/utils/type-guard.ts";

type Event = "SessionUpdateEvent" | "SessionRemoveEvent" | "CaptureTerminatedEvent";

//
// Session update event
//

type SessionUpdateEventData = {
  tabId: number;
  sessionId: string;
};

export async function publishSessionUpdateEvent(
  tabId: number,
  sessionId: string,
): Promise<void | Error> {
  const data: SessionUpdateEventData = { tabId, sessionId };
  return await publishEvent("SessionUpdateEvent", data);
}

export function subscribeSessionUpdateEvent(
  handler: (tabId: number, sessionId: string) => Promise<void>,
): void | Error {
  return subscribeEvent("SessionUpdateEvent", async (data: unknown): Promise<void> => {
    if (isSessionUpdateEventData(data)) {
      await handler(data.tabId, data.sessionId);
    } else {
      console.error("Invalid SessionUpdateEvent data:", data);
    }
  });
}

//
// Session remove event
//

type SessionRemoveEventData = {
  tabId: number;
  sessionId: string;
};

export async function publishSessionRemoveEvent(
  tabId: number,
  sessionId: string,
): Promise<void | Error> {
  const data: SessionRemoveEventData = { tabId, sessionId };
  return await publishEvent("SessionRemoveEvent", data);
}

export function subscribeSessionRemoveEvent(
  handler: (tabId: number, sessionId: string) => Promise<void>,
): void | Error {
  return subscribeEvent("SessionRemoveEvent", async (data: unknown): Promise<void> => {
    if (isSessionRemoveEventData(data)) {
      await handler(data.tabId, data.sessionId);
    } else {
      console.error("Invalid SessionRemoveEvent data:", data);
    }
  });
}

//
// Capture terminated event
//

type CaptureTerminatedEventData = {
  tabId: number;
  reason: CaptureTerminatedReason;
};

export type CaptureTerminatedReason = "target_closed" | "canceled_by_user" | "unknown";

export async function publishCaptureTerminatedEvent(
  tabId: number,
  reason: CaptureTerminatedReason,
): Promise<void | Error> {
  const data: CaptureTerminatedEventData = { tabId, reason };
  return await publishEvent("CaptureTerminatedEvent", data);
}

export function subscribeCaptureTerminatedEvent(
  handler: (tabId: number, reason: CaptureTerminatedReason) => Promise<void>,
): void | Error {
  return subscribeEvent("CaptureTerminatedEvent", async (data: unknown): Promise<void> => {
    if (isCaptureTerminatedEventData(data)) {
      await handler(data.tabId, data.reason);
    } else {
      console.error("Invalid CaptureTerminatedEvent data:", data);
    }
  });
}

//
//
//

type PubSubMessage = {
  event: Event;
  data: unknown;
};

async function publishEvent(event: Event, data: unknown): Promise<void | Error> {
  try {
    const message: PubSubMessage = { event, data };
    await chrome.runtime.sendMessage(message);
    return;
  } catch (err) {
    return new Error("Failed to send PubSub message", { cause: err });
  }
}

function subscribeEvent(event: Event, handler: (data: unknown) => Promise<unknown>): void | Error {
  try {
    // Note: Due to a Chrome bug, the callback passed to addListener cannot be async
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#sending_an_asynchronous_response_using_sendresponse
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (!isPubSubMessage(message) || message.event !== event) {
        return false;
      }

      (async () => {
        await handler(message.data);
      })();

      return false;
    });
  } catch (err) {
    return new Error("Failed to add listener on PubSub message", { cause: err });
  }
}

//
// Type guards
//

function isSessionUpdateEventData(u: unknown): u is SessionUpdateEventData {
  return isObject(u) && typeof u.tabId === "number" && typeof u.sessionId === "string";
}

function isSessionRemoveEventData(u: unknown): u is SessionRemoveEventData {
  return isObject(u) && typeof u.tabId === "number" && typeof u.sessionId === "string";
}

function isCaptureTerminatedEventData(u: unknown): u is CaptureTerminatedEventData {
  return isObject(u) && typeof u.tabId === "number" && isCaptureTerminatedReason(u.reason);
}

function isCaptureTerminatedReason(u: unknown): u is CaptureTerminatedReason {
  return (
    typeof u === "string" && (u === "target_closed" || u === "canceled_by_user" || u === "unknown")
  );
}

function isPubSubMessage(u: unknown): u is PubSubMessage {
  return isObject(u) && typeof u.event === "string" && isObject(u.data);
}
