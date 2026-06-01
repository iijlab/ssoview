/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary } from "@/common/models/session-summary.ts";
import {
  getAllSessionStorageItems,
  getSessionStorageBytesInUse,
} from "@/common/utils/chrome-storage.ts";
import { createLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";
import {
  publishCaptureTerminatedEvent,
  publishSessionRemoveEvent,
  publishSessionUpdateEvent,
} from "@/common/pubsub.ts";
import {
  registerDumpSessionHandler,
  registerGetSessionSummariesHandler,
  registerLoadSessionHandler,
  registerRemoveSessionHandler,
  registerStartMonitoringHandler,
  registerStopMonitoringHandler,
} from "@/common/rpc.ts";
import { deleteSession, getSessionSummaries } from "@/common/services/session-manager.ts";
import { dumpSessionArchive, loadSessionArchive } from "@/common/services/session-archiver.ts";
import { setupMonitoring, startMonitoring, stopMonitoring } from "@/service-worker/http-monitor.ts";
import { processHttpMessage } from "@/service-worker/saml-recorder.ts";
import "@/service-worker/sidepanel-activator.ts";

function init() {
  registerStartMonitoringHandler(onStartMonitoring);
  registerStopMonitoringHandler(onStopMonitoring);
  registerGetSessionSummariesHandler(onGetSessionSummaries);
  registerRemoveSessionHandler(onRemoveSession);
  registerDumpSessionHandler(onDumpSession);
  registerLoadSessionHandler(onLoadSession);

  setupMonitoring(
    async (tabId, httpRequest) => {
      const sessionId = await processHttpMessage(tabId, httpRequest);
      if (sessionId instanceof Error) {
        console.warn("Failed to process HTTP request:", sessionId);
      } else if (sessionId !== undefined) {
        const result = await publishSessionUpdateEvent(tabId, sessionId);
        if (result instanceof Error) {
          console.warn("Failed to publish session update event:", result);
        }
      }
    },
    async (tabId, httpResponse) => {
      const sessionId = await processHttpMessage(tabId, httpResponse);
      if (sessionId instanceof Error) {
        console.warn("Failed to process HTTP response:", sessionId);
      } else if (sessionId !== undefined) {
        const result = await publishSessionUpdateEvent(tabId, sessionId);
        if (result instanceof Error) {
          console.warn("Failed to publish session update event:", result);
        }
      }
    },
    async (tabId, reason) => {
      const result = await publishCaptureTerminatedEvent(tabId, reason);
      if (result instanceof Error) {
        console.warn("Failed to publish monitoring terminated event:", result);
      }
    },
  );
}

async function onStartMonitoring(tabId: number): Promise<void | Error> {
  return await startMonitoring(tabId);
}

async function onStopMonitoring(tabId: number): Promise<void | Error> {
  return await stopMonitoring(tabId);
}

async function onGetSessionSummaries(tabId: number): Promise<SessionSummary[] | Error> {
  const summaries = await getSessionSummaries(tabId);
  if (summaries instanceof Error) {
    return summaries;
  }

  return summaries.map((summary) => ({
    ...summary,
    // for backward compatibility
    source: summary.imported ? "imported" : "captured",
  }));
}

async function onRemoveSession(tabId: number, sessionId: string): Promise<void | Error> {
  const result = await deleteSession(tabId, sessionId);
  if (result instanceof Error) {
    return result;
  }

  return publishSessionRemoveEvent(tabId, sessionId);
}

async function onDumpSession(tabId: number, sessionId: string): Promise<string | Error> {
  return await dumpSessionArchive(tabId, sessionId);
}

async function onLoadSession(tabId: number, har: string): Promise<void | Error> {
  const sessionIds = await loadSessionArchive(tabId, har);
  if (sessionIds instanceof Error) {
    return sessionIds;
  }

  for (const sessionId of sessionIds) {
    const result = await publishSessionUpdateEvent(tabId, sessionId);
    if (result instanceof Error) {
      return result;
    }
  }
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
      return await onGetSessionSummaries(tid);
    },
    removeSession: async (tid: number, sid: string) => {
      return await onRemoveSession(tid, sid);
    },
    dumpSession: async (tid: number, sid: string) => {
      return await onDumpSession(tid, sid);
    },
    loadSession: async (tid: number, sar: string) => {
      return await onLoadSession(tid, sar);
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
