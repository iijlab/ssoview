/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SsoTrace, newSsoTrace } from "@/core/sso/sso-trace.ts";
import {
  getAllSessionStorageKeys,
  getSessionStorageItems,
  removeSessionStorageItems,
  setSessionStorageItem,
} from "@/shared/chrome-storage.ts";
import {
  deleteSsoTrace,
  findAllSsoTraces,
  findSsoTraceByCorrelationKey,
  findSsoTraceById,
  saveSsoTrace,
} from "./sso-trace-repository.ts";

vi.mock("@/shared/chrome-storage.ts", () => ({
  getAllSessionStorageKeys: vi.fn(),
  getSessionStorageItems: vi.fn(),
  removeSessionStorageItems: vi.fn(),
  setSessionStorageItem: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function keyOf(ssoTrace: { id: string; tracingSessionId: string; correlationKey: string }): string {
  return `{"id":"${ssoTrace.id}","kind":"trace","tracingSessionId":"${ssoTrace.tracingSessionId}","correlationKey":"${ssoTrace.correlationKey}"}`;
}

// Puts the SSO traces into the mocked storage, in the given order of keys
function mockStorage(...ssoTraces: SsoTrace[]): void {
  const items = Object.fromEntries(ssoTraces.map((t) => [keyOf(t), t]));
  vi.mocked(getAllSessionStorageKeys).mockResolvedValue(Object.keys(items));
  vi.mocked(getSessionStorageItems).mockImplementation(async (keys) =>
    Object.fromEntries(keys.filter((k) => k in items).map((k) => [k, items[k]])),
  );
}

describe("saveSsoTrace", () => {
  it("saves the SSO trace under a JSON key of the ID, kind, tracing session, and correlation key", async () => {
    vi.mocked(setSessionStorageItem).mockResolvedValue(undefined);
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");

    const result = await saveSsoTrace(ssoTrace);

    expect(result).toBeUndefined();
    expect(setSessionStorageItem).toHaveBeenCalledExactlyOnceWith(keyOf(ssoTrace), ssoTrace);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("error");
    vi.mocked(setSessionStorageItem).mockResolvedValue(error);

    const result = await saveSsoTrace(
      newSsoTrace("tracing-session-1", "saml", "correlation-key-1"),
    );

    expect(result).toBe(error);
  });
});

describe("deleteSsoTrace", () => {
  it("removes the SSO trace by its key", async () => {
    vi.mocked(removeSessionStorageItems).mockResolvedValue(undefined);
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");

    const result = await deleteSsoTrace(ssoTrace);

    expect(result).toBeUndefined();
    expect(removeSessionStorageItems).toHaveBeenCalledExactlyOnceWith([keyOf(ssoTrace)]);
  });

  it("propagates an error from the storage", async () => {
    const error = new Error("error");
    vi.mocked(removeSessionStorageItems).mockResolvedValue(error);

    const result = await deleteSsoTrace(
      newSsoTrace("tracing-session-1", "saml", "correlation-key-1"),
    );

    expect(result).toBe(error);
  });
});

describe("findAllSsoTraces", () => {
  it("retrieves every SSO trace, newest first", async () => {
    const first = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    const second = newSsoTrace("tracing-session-1", "saml", "correlation-key-2");
    const third = newSsoTrace("tracing-session-2", "saml", "correlation-key-3");
    mockStorage(second, third, first);

    expect(await findAllSsoTraces()).toEqual([third, second, first]);
  });

  it("returns an empty array when no SSO trace is saved", async () => {
    mockStorage();

    expect(await findAllSsoTraces()).toEqual([]);
  });

  it("ignores keys that are not SSO trace keys", async () => {
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    mockStorage(ssoTrace);
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([
      "not-a-json-key",
      `{"id":"x","kind":"event","type":"TracingStarted"}`,
      `{"id":"x","kind":"trace","tracingSessionId":"tracing-session-1"}`,
      keyOf(ssoTrace),
    ]);

    expect(await findAllSsoTraces()).toEqual([ssoTrace]);
  });

  it("skips invalid SSO traces with a warning", async () => {
    const valid = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    const invalid = {
      ...newSsoTrace("tracing-session-1", "saml", "correlation-key-2"),
      protocol: "kerberos",
    };
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([keyOf(valid), keyOf(invalid)]);
    vi.mocked(getSessionStorageItems).mockResolvedValue({
      [keyOf(valid)]: valid,
      [keyOf(invalid)]: invalid,
    });

    expect(await findAllSsoTraces()).toEqual([valid]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Invalid SSO trace:", invalid);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findAllSsoTraces()).toBe(error);
  });

  it("propagates an error from the item retrieval", async () => {
    const error = new Error("error");
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue([keyOf(ssoTrace)]);
    vi.mocked(getSessionStorageItems).mockResolvedValue(error);

    expect(await findAllSsoTraces()).toBe(error);
  });
});

describe("findSsoTraceByCorrelationKey", () => {
  it("finds the SSO trace with the correlation key in the tracing session", async () => {
    const target = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    mockStorage(newSsoTrace("tracing-session-1", "saml", "correlation-key-2"), target);

    expect(await findSsoTraceByCorrelationKey("tracing-session-1", "correlation-key-1")).toEqual(
      target,
    );
  });

  it("does not find an SSO trace with the same correlation key in another tracing session", async () => {
    mockStorage(newSsoTrace("tracing-session-2", "saml", "correlation-key-1"));

    expect(
      await findSsoTraceByCorrelationKey("tracing-session-1", "correlation-key-1"),
    ).toBeUndefined();
  });

  it("returns undefined when no SSO trace has the correlation key", async () => {
    mockStorage(newSsoTrace("tracing-session-1", "saml", "correlation-key-2"));

    expect(
      await findSsoTraceByCorrelationKey("tracing-session-1", "correlation-key-1"),
    ).toBeUndefined();
  });

  it("reads only the item with the matching key", async () => {
    const target = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    mockStorage(newSsoTrace("tracing-session-1", "saml", "correlation-key-2"), target);

    await findSsoTraceByCorrelationKey("tracing-session-1", "correlation-key-1");

    expect(getSessionStorageItems).toHaveBeenCalledExactlyOnceWith([keyOf(target)]);
  });

  it("propagates an error from the key retrieval", async () => {
    const error = new Error("error");
    vi.mocked(getAllSessionStorageKeys).mockResolvedValue(error);

    expect(await findSsoTraceByCorrelationKey("tracing-session-1", "correlation-key-1")).toBe(
      error,
    );
  });
});

describe("findSsoTraceById", () => {
  it("retrieves the SSO trace with the ID", async () => {
    const target = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    mockStorage(newSsoTrace("tracing-session-1", "saml", "correlation-key-2"), target);

    expect(await findSsoTraceById(target.id)).toEqual(target);
  });

  it("returns undefined when no SSO trace has the ID", async () => {
    mockStorage(newSsoTrace("tracing-session-1", "saml", "correlation-key-1"));

    expect(await findSsoTraceById("unknown-id")).toBeUndefined();
  });
});
