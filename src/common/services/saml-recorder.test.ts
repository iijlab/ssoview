/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SsoTrace, isSsoTrace } from "@/common/models/flow-entry.ts";
import { type HttpRequest, type HttpResponse } from "@/common/models/http-message.ts";
import { type SamlLog, isSamlLog } from "@/common/models/saml-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  setSessionStorageItem,
} from "@/common/utils/chrome-storage.ts";
import { recordSamlLog } from "./saml-recorder.ts";

vi.mock("@/common/utils/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

let storage: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();

  storage = {};
  vi.mocked(getAllSessionStorageKeys).mockImplementation(async () => Object.keys(storage));
  vi.mocked(getSessionStorageItems).mockImplementation(async (keys) =>
    Object.fromEntries(keys.filter((k) => k in storage).map((k) => [k, storage[k]])),
  );
  vi.mocked(setSessionStorageItem).mockImplementation(async (key, value) => {
    storage[key] = value;
  });
});

function savedSsoTraces(): SsoTrace[] {
  return Object.values(storage).filter((v): v is SsoTrace => isSsoTrace(v));
}

function savedSamlLogs(): SamlLog[] {
  return Object.values(storage)
    .filter((v): v is SamlLog => isSamlLog(v))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));
}

function makeRequest(): HttpRequest {
  return {
    id: "msg-0",
    observedAt: "2025-12-31T23:59:59Z",
    type: "Request",
    fetchRequestId: "req-1",
    headers: [],
    url: "https://sp.example.com/resource",
    method: "GET",
    body: "",
  } as unknown as HttpRequest;
}

function makeResponse(): HttpResponse {
  return {
    id: "msg-1",
    observedAt: "2026-01-01T00:00:00Z",
    type: "Response",
    fetchRequestId: "req-1",
    headers: [{ name: "Date", value: "Thu, 01 Jan 2026 00:00:00 GMT" }],
    url: "https://sp.example.com/login",
    method: "GET",
    statusCode: 200,
    body: "",
  } as unknown as HttpResponse;
}

describe("recordSamlLog", () => {
  it("issues an SSO trace for an unknown correlation key and saves the log", async () => {
    const result = await recordSamlLog(
      "cs-1",
      { step: 6, correlationKey: "authn-req-1" },
      makeResponse(),
    );

    expect(result).toEqual(savedSsoTraces()[0]);
    expect(savedSsoTraces()).toEqual([
      expect.objectContaining({
        tracingSessionId: "cs-1",
        protocol: "saml",
        correlationKey: "authn-req-1",
      }),
    ]);
    const samlLogs = savedSamlLogs();
    expect(samlLogs).toHaveLength(1);
    expect(samlLogs[0]).toMatchObject({ ssoTraceId: savedSsoTraces()[0]!.id });
  });

  it("saves the step 1 log before the step 2 log", async () => {
    const pairedHttpRequest = makeRequest();

    const result = await recordSamlLog(
      "cs-1",
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
      pairedHttpRequest,
    );

    expect(result).toEqual(savedSsoTraces()[0]);
    const samlLogs = savedSamlLogs();
    expect(samlLogs.map((l) => l.step)).toEqual([1, 2]);
    expect(samlLogs[0]).toMatchObject({
      ssoTraceId: savedSsoTraces()[0]!.id,
      httpMessageId: pairedHttpRequest.id,
      observedAt: pairedHttpRequest.observedAt,
      serverHostname: "sp.example.com",
      action: "User Agent requests a secured resource at Service Provider",
    });
  });

  it("skips the step 1 log when the paired request is missing", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await recordSamlLog("cs-1", { step: 2, correlationKey: "authn-req-1" }, makeResponse());

    expect(savedSamlLogs().map((l) => l.step)).toEqual([2]);
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("does not issue a step 1 log for steps other than 2", async () => {
    await recordSamlLog(
      "cs-1",
      { step: 6, correlationKey: "authn-req-1" },
      makeResponse(),
      makeRequest(),
    );

    expect(savedSamlLogs().map((l) => l.step)).toEqual([6]);
  });

  it("returns an error when the step 1 log cannot be built", async () => {
    const pairedHttpRequest = { ...makeRequest(), url: "not a url" } as HttpRequest;

    const result = await recordSamlLog(
      "cs-1",
      { step: 2, correlationKey: "authn-req-1" },
      makeResponse(),
      pairedHttpRequest,
    );

    expect(result).toBeInstanceOf(Error);
    expect(savedSamlLogs()).toEqual([]);
  });

  it("reuses the SSO trace of the same correlation key", async () => {
    const samlSignal = { step: 2, correlationKey: "authn-req-1" } as const;
    const first = await recordSamlLog("cs-1", samlSignal, makeResponse(), makeRequest());
    const second = await recordSamlLog(
      "cs-1",
      { step: 6, correlationKey: "authn-req-1" },
      makeResponse(),
    );

    expect(savedSsoTraces()).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("issues an SSO trace per tracing session", async () => {
    const samlSignal = { step: 2, correlationKey: "authn-req-1" } as const;
    await recordSamlLog("cs-1", samlSignal, makeResponse(), makeRequest());
    await recordSamlLog("cs-2", samlSignal, makeResponse(), makeRequest());

    expect(savedSsoTraces().map((f) => f.tracingSessionId)).toEqual(["cs-1", "cs-2"]);
  });

  it("returns an error when the log cannot be built", async () => {
    const httpResponse = { ...makeResponse(), url: "not a url" } as HttpResponse;

    const result = await recordSamlLog(
      "cs-1",
      { step: 2, correlationKey: "authn-req-1" },
      httpResponse,
      makeRequest(),
    );

    expect(result).toBeInstanceOf(Error);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("storage failed");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await recordSamlLog(
      "cs-1",
      { step: 6, correlationKey: "authn-req-1" },
      makeResponse(),
    );

    expect(result).toBe(error);
  });
});
