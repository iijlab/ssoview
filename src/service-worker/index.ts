/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { publishCaptureTerminatedEvent, publishSessionUpdateEvent } from "@/common/pubsub.ts";
import { registerStartMonitoringHandler, registerStopMonitoringHandler } from "@/common/rpc.ts";
import { dumpSessionArchive, loadSessionArchive } from "@/common/services/session-archiver.ts";
import { deleteSession, getSessionSummaries } from "@/common/services/session-manager.ts";
import { isAttached } from "@/common/utils/chrome-debugger.ts";
import {
  getAllSessionStorageItems,
  getSessionStorageBytesInUse,
} from "@/common/utils/chrome-storage.ts";
import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import { BadgeColor, hideBadge, showBadge } from "@/service-worker/action-icon.ts";
import {
  registerCaptureStopHandler,
  startCapturing,
  stopCapturing,
} from "@/service-worker/capture-manager.ts";
import { registerHttpInterceptionHandlers } from "@/service-worker/http-interception.ts";
import { processHttpRequest, processHttpResponse } from "@/service-worker/saml-tracer.ts";
import {
  registerSidePanelCloseHandler,
  registerSidePanelOpenHandler,
} from "@/service-worker/side-panel.ts";

function init() {
  registerStartMonitoringHandler(onStartMonitoring);
  registerStopMonitoringHandler(onStopMonitoring);

  registerHttpInterceptionHandlers(
    async (tabId, httpRequest) => {
      const sessionId = await processHttpRequest(tabId, httpRequest);
      if (sessionId instanceof Error) {
        console.warn("Failed to process HTTP request:", sessionId);
      } else if (sessionId !== undefined) {
        const publishError = await publishSessionUpdateEvent(tabId, sessionId);
        if (publishError) {
          console.warn("Failed to publish session update event:", publishError);
        }
      }
    },
    async (tabId, httpResponse, pairedHttpRequest) => {
      const sessionId = await processHttpResponse(tabId, httpResponse, pairedHttpRequest);
      if (sessionId instanceof Error) {
        console.warn("Failed to process HTTP response:", sessionId);
      } else if (sessionId !== undefined) {
        const publishError = await publishSessionUpdateEvent(tabId, sessionId);
        if (publishError) {
          console.warn("Failed to publish session update event:", publishError);
        }
      }
    },
  );

  registerCaptureStopHandler(async (tabId) => {
    hideBadge();

    // TODO: The detach reason is no longer used. This parameter will be removed.
    const publishError = await publishCaptureTerminatedEvent(tabId, "unknown");
    if (publishError) {
      console.warn("Failed to publish monitoring terminated event:", publishError);
    }
  });

  registerSidePanelOpenHandler();
  registerSidePanelCloseHandler(async (tabId) => {
    const attached = await isAttached(tabId);
    if (attached instanceof Error) {
      console.warn("Failed to get debugging state:", attached);
    } else if (attached) {
      const stopError = await onStopMonitoring(tabId);
      if (stopError) {
        console.warn("Failed to stop monitoring:", stopError);
      }
    }
  });
}

async function onStartMonitoring(tabId: number): Promise<void | Error> {
  const startError = await startCapturing(tabId);
  if (startError) {
    return startError;
  }

  showBadge("REC", BadgeColor.REC_TEXT, BadgeColor.REC_BACKGROUND);
}

async function onStopMonitoring(tabId: number): Promise<void | Error> {
  const stopError = await stopCapturing(tabId);
  if (stopError) {
    return stopError;
  }

  hideBadge();
}

init();

//
// Debug utilities
//

if (import.meta.env.MODE === "development") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).cmd = {
    debugStorage: async () => {
      return await debugStorage();
    },
    getSessionSummaries: async (tid: number) => {
      return await getSessionSummaries(tid);
    },
    removeSession: async (tid: number, sid: string) => {
      return await deleteSession(tid, sid);
    },
    dumpSession: async (tid: number, sid: string) => {
      return await dumpSessionArchive(tid, sid);
    },
    loadSession: async (tid: number, sar: string) => {
      return await loadSessionArchive(tid, sar);
    },
  };

  async function debugStorage() {
    const debug = await createLabeledDebugLogger(["STORAGE"]);

    const allEntries = await getAllSessionStorageItems();
    if (allEntries instanceof Error) {
      console.warn("Failed to get all storage entries:", allEntries);
      return;
    }

    for (const [key, value] of Object.entries(allEntries).sort()) {
      const bytes = await getSessionStorageBytesInUse(key);
      if (bytes instanceof Error) {
        console.warn("Failed to get bytes in use:", bytes);
        continue;
      }
      debug({ [key]: value }, `${bytes.toLocaleString()} bytes`);
    }

    const totalBytes = await getSessionStorageBytesInUse(null);
    if (totalBytes instanceof Error) {
      console.warn("Failed to get total bytes in use:", totalBytes);
      return;
    }
    debug(
      `Storage usage: ${Object.keys(allEntries).length} items (${totalBytes.toLocaleString()} bytes)`,
    );
  }
}
