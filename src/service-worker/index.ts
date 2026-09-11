/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { publishCaptureTerminatedEvent, publishSessionUpdateEvent } from "@/common/pubsub.ts";
import { registerStartMonitoringHandler, registerStopMonitoringHandler } from "@/common/rpc.ts";
import { isTracedTab } from "@/common/services/watch-query.ts";
import { BadgeColor, hideBadge, showBadge } from "@/service-worker/action-icon.ts";
import {
  registerTracingTerminatedHandler,
  startTracing,
  stopTracing,
} from "@/service-worker/capture-manager.ts";
import { registerDevCommands } from "@/service-worker/dev-commands.ts";
import { registerHttpInterceptionHandlers } from "@/service-worker/http-interception.ts";
import { ingestHttpRequest, ingestHttpResponse } from "@/service-worker/saml-tracer.ts";
import {
  registerSidePanelCloseHandler,
  registerSidePanelOpenHandler,
} from "@/service-worker/side-panel.ts";

function init() {
  registerStartMonitoringHandler(handleStartTracingCommand);
  registerStopMonitoringHandler(handleStopTracingCommand);

  registerHttpInterceptionHandlers(
    async (tabId, httpRequest) => {
      const sessionId = await ingestHttpRequest(httpRequest);
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
      const sessionId = await ingestHttpResponse(httpResponse, pairedHttpRequest);
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

  registerTracingTerminatedHandler(async (tabId) => {
    hideBadge();

    // TODO: The detach reason is no longer used. This parameter will be removed.
    const publishError = await publishCaptureTerminatedEvent(tabId, "unknown");
    if (publishError) {
      console.warn("Failed to publish monitoring terminated event:", publishError);
    }
  });

  registerSidePanelOpenHandler();
  registerSidePanelCloseHandler(async (tabId) => {
    const tabTraced = await isTracedTab(tabId);
    if (tabTraced instanceof Error) {
      console.warn("Failed to get tab tracing state:", tabTraced);
    } else if (tabTraced) {
      const stopError = await handleStopTracingCommand(tabId);
      if (stopError) {
        console.warn("Failed to stop monitoring:", stopError);
      }
    }
  });

  if (import.meta.env.MODE === "development") {
    registerDevCommands();
  }
}

async function handleStartTracingCommand(tabId: number): Promise<void | Error> {
  const startError = await startTracing(tabId);
  if (startError) {
    return startError;
  }

  showBadge("REC", BadgeColor.REC_TEXT, BadgeColor.REC_BACKGROUND);
}

async function handleStopTracingCommand(tabId: number): Promise<void | Error> {
  const stopError = await stopTracing(tabId);
  if (stopError) {
    return stopError;
  }

  hideBadge();
}

init();
