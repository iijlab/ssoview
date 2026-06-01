/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// RPC: inter-component communication of the following type
// - response required
// - single receiver

import { type SessionSummary, isSessionSummaryArray } from "@/common/models/session-summary.ts";
import { isObject } from "@/common/utils/type-guard.ts";

type Method =
  | "StartMonitoring"
  | "StopMonitoring"
  | "GetSessionSummaries"
  | "RemoveSession"
  | "DumpSession"
  | "LoadSession";

//
// Start session recording
//

type StartMonitoringParams = {
  tabId: number;
};

export async function startMonitoring(tabId: number): Promise<void | Error> {
  const params: StartMonitoringParams = { tabId };
  const result = await callRemoteProcedure("StartMonitoring", params);
  if (result instanceof Error) {
    return result;
  }
}

export function registerStartMonitoringHandler(handler: (tabId: number) => Promise<void | Error>) {
  return registerHandler("StartMonitoring", async (params: unknown): Promise<void | Error> => {
    return isStartMonitoringParams(params)
      ? await handler(params.tabId)
      : new Error("Invalid StartMonitoring params");
  });
}

//
// Stop session recording
//

type StopMonitoringParams = {
  tabId: number;
};

export async function stopMonitoring(tabId: number): Promise<void | Error> {
  const params: StopMonitoringParams = { tabId };
  const result = await callRemoteProcedure("StopMonitoring", params);
  if (result instanceof Error) {
    return result;
  }
}

export function registerStopMonitoringHandler(handler: (tabId: number) => Promise<void | Error>) {
  return registerHandler("StopMonitoring", async (params: unknown): Promise<void | Error> => {
    return isStopMonitoringParams(params)
      ? await handler(params.tabId)
      : new Error("Invalid StopMonitoring params");
  });
}

//
// Get session summaries in bulk
//

type GetSessionSummariesParams = {
  tabId: number;
};

export async function getSessionSummaries(tabId: number): Promise<SessionSummary[] | Error> {
  const params: GetSessionSummariesParams = { tabId };
  const result = await callRemoteProcedure("GetSessionSummaries", params);
  return result instanceof Error || isSessionSummaryArray(result)
    ? result
    : new Error("Invalid session summaries");
}

export function registerGetSessionSummariesHandler(
  handler: (tabId: number) => Promise<SessionSummary[] | Error>,
) {
  return registerHandler(
    "GetSessionSummaries",
    async (params: unknown): Promise<SessionSummary[] | Error> => {
      return isGetSessionSummariesParams(params)
        ? await handler(params.tabId)
        : new Error("Invalid GetSessionSummaries params");
    },
  );
}

//
// Remove session
//

type RemoveSessionParams = {
  tabId: number;
  sessionId: string;
};

export async function removeSession(tabId: number, sessionId: string): Promise<void | Error> {
  const params: RemoveSessionParams = { tabId, sessionId };
  const result = await callRemoteProcedure("RemoveSession", params);
  if (result instanceof Error) {
    return result;
  }
}

export function registerRemoveSessionHandler(
  handler: (tabId: number, sessionId: string) => Promise<void | Error>,
) {
  return registerHandler("RemoveSession", async (params: unknown): Promise<void | Error> => {
    return isRemoveSessionParams(params)
      ? await handler(params.tabId, params.sessionId)
      : new Error("Invalid RemoveSession params");
  });
}

//
// Export session
//

type DumpSessionParams = {
  tabId: number;
  sessionId: string;
};

export async function dumpSession(tabId: number, sessionId: string): Promise<string | Error> {
  const params: DumpSessionParams = { tabId, sessionId };
  const result = await callRemoteProcedure("DumpSession", params);
  return result instanceof Error || typeof result === "string"
    ? result
    : new Error("Invalid session dump");
}

export function registerDumpSessionHandler(
  handler: (tabId: number, sessionId: string) => Promise<string | Error>,
) {
  return registerHandler("DumpSession", async (params: unknown): Promise<string | Error> => {
    return isDumpSessionParams(params)
      ? await handler(params.tabId, params.sessionId)
      : new Error("Invalid DumpSession params");
  });
}

//
// Import session
//

type LoadSessionParams = {
  tabId: number;
  sessionArchive: string;
};

export async function loadSession(tabId: number, sessionArchive: string): Promise<void | Error> {
  const params: LoadSessionParams = { tabId, sessionArchive };
  const result = await callRemoteProcedure("LoadSession", params);
  if (result instanceof Error) {
    return result;
  }
}

export function registerLoadSessionHandler(
  handler: (tabId: number, sessionArchive: string) => Promise<void | Error>,
) {
  return registerHandler("LoadSession", async (params: unknown): Promise<void | Error> => {
    return isLoadSessionParams(params)
      ? await handler(params.tabId, params.sessionArchive)
      : new Error("Invalid LoadSession params");
  });
}

//
//
//

type RpcMessage = {
  method: Method;
  params: unknown;
};

// JSON-ifiable error
type RpcError = {
  __isRpcError: true;
  name: string;
  message: string;
  stack?: string;
  cause?: RpcError;
};

function isRpcError(u: unknown): u is RpcError {
  return (
    isObject(u) &&
    u.__isRpcError === true &&
    typeof u.name === "string" &&
    typeof u.message === "string" &&
    (!("stack" in u) || typeof u.stack === "string") &&
    (!("cause" in u) || isRpcError(u.cause))
  );
}

function toRpcError(err: Error): RpcError {
  return {
    __isRpcError: true,
    name: err.name,
    message: err.message,
    stack: err.stack,
    cause: err.cause instanceof Error ? toRpcError(err.cause) : undefined,
  };
}

function fromRpcError(rpcErr: RpcError): Error {
  const cause = rpcErr.cause !== undefined ? fromRpcError(rpcErr.cause) : undefined;
  const err = new Error(rpcErr.message, { cause });
  err.name = rpcErr.name;
  if (rpcErr.stack !== undefined) {
    err.stack = rpcErr.stack;
  }
  return err;
}

async function callRemoteProcedure(method: Method, params: unknown): Promise<unknown | Error> {
  try {
    const message: RpcMessage = { method, params };
    const result = await chrome.runtime.sendMessage(message);
    return isRpcError(result) ? fromRpcError(result) : result;
  } catch (err) {
    return new Error("Failed to send RPC message", { cause: err });
  }
}

function registerHandler(
  method: Method,
  handler: (params: unknown) => Promise<unknown>,
): void | Error {
  try {
    // Note: Due to a Chrome bug, the callback passed to addListener cannot be async
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage#sending_an_asynchronous_response_using_sendresponse
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isRpcMessage(message) || message.method !== method) {
        return false;
      }

      (async () => {
        const response = await handler(message.params);
        sendResponse(response instanceof Error ? toRpcError(response) : response);
      })();

      return true;
    });
  } catch (err) {
    return new Error("Failed to add listener on RPC message", { cause: err });
  }
}

//
// Type guards
//

function isStartMonitoringParams(u: unknown): u is StartMonitoringParams {
  return isObject(u) && typeof u.tabId === "number";
}

function isStopMonitoringParams(u: unknown): u is StopMonitoringParams {
  return isObject(u) && typeof u.tabId === "number";
}

function isGetSessionSummariesParams(u: unknown): u is GetSessionSummariesParams {
  return isObject(u) && typeof u.tabId === "number";
}

function isRemoveSessionParams(u: unknown): u is RemoveSessionParams {
  return isObject(u) && typeof u.tabId === "number" && typeof u.sessionId === "string";
}

function isDumpSessionParams(u: unknown): u is DumpSessionParams {
  return isObject(u) && typeof u.tabId === "number" && typeof u.sessionId === "string";
}

function isLoadSessionParams(u: unknown): u is LoadSessionParams {
  return isObject(u) && typeof u.tabId === "number" && typeof u.sessionArchive === "string";
}

function isRpcMessage(u: unknown): u is RpcMessage {
  return isObject(u) && typeof u.method === "string" && isObject(u.params);
}
