/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// RPC: inter-component communication of the following type
// - response required
// - single receiver

import { isObject } from "@/common/utils/type-guard.ts";

type Method = "StartMonitoring" | "StopMonitoring";

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

function isRpcMessage(u: unknown): u is RpcMessage {
  return isObject(u) && typeof u.method === "string" && isObject(u.params);
}
