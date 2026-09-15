/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/core/http/http-message.ts";
import { deleteHttpMessages } from "@/core/http/http-message-repository.ts";
import { deleteSamlLogsBySsoTraceId } from "@/core/sso/saml-log-repository.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import { deleteSsoTrace, findSsoTraceById } from "@/core/sso/sso-trace-repository.ts";
import { deleteSsoFlow } from "./delete-sso-flow.ts";

vi.mock("@/core/sso/sso-trace-query.ts", () => ({
  getHttpMessagesBySsoTraceId: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-repository.ts", () => ({
  deleteSsoTrace: vi.fn(),
  findSsoTraceById: vi.fn(),
}));

vi.mock("@/core/http/http-message-repository.ts", () => ({
  deleteHttpMessages: vi.fn(),
}));

vi.mock("@/core/sso/saml-log-repository.ts", () => ({
  deleteSamlLogsBySsoTraceId: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(findSsoTraceById).mockResolvedValue(makeSsoTrace());
  vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue([]);
  vi.mocked(deleteSamlLogsBySsoTraceId).mockResolvedValue(undefined);
  vi.mocked(deleteSsoTrace).mockResolvedValue(undefined);
  vi.mocked(deleteHttpMessages).mockResolvedValue(undefined);
});

//
// Helpers
//

function makeSsoTrace(overrides: Partial<SsoTrace> = {}): SsoTrace {
  return {
    id: "sso-trace-1",
    tracingSessionId: "tracing-session-1",
    protocol: "saml",
    correlationKey: "correlation-key-1",
    ...overrides,
  };
}

//
// Tests
//

describe("deleteSsoFlow", () => {
  it("deletes the logs, the SSO trace, and then the HTTP messages of the SSO trace", async () => {
    const ssoTrace = makeSsoTrace();
    const httpMessages = [{ id: "msg-1" } as HttpMessage];
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(httpMessages);

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(findSsoTraceById).toHaveBeenCalledWith("sso-trace-1");
    expect(getHttpMessagesBySsoTraceId).toHaveBeenCalledWith("sso-trace-1");
    expect(deleteSamlLogsBySsoTraceId).toHaveBeenCalledWith("sso-trace-1");
    expect(deleteSsoTrace).toHaveBeenCalledWith(ssoTrace);
    expect(deleteHttpMessages).toHaveBeenCalledWith(httpMessages);
    const order = [deleteSamlLogsBySsoTraceId, deleteSsoTrace, deleteHttpMessages].map(
      (fn) => vi.mocked(fn).mock.invocationCallOrder[0]!,
    );
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it("does nothing with a warning when no SSO trace has the ID", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(findSsoTraceById).mockResolvedValue(undefined);

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace cannot be found", async () => {
    const error = new Error("error");
    vi.mocked(findSsoTraceById).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
  });

  it("returns an error when the HTTP messages cannot be found", async () => {
    const error = new Error("error");
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSamlLogsBySsoTraceId).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the log deletion fails", async () => {
    const error = new Error("error");
    vi.mocked(deleteSamlLogsBySsoTraceId).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteSsoTrace).not.toHaveBeenCalled();
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("returns an error when the SSO trace deletion fails", async () => {
    const error = new Error("error");
    vi.mocked(deleteSsoTrace).mockResolvedValue(error);

    expect(await deleteSsoFlow("sso-trace-1")).toBe(error);
    expect(deleteHttpMessages).not.toHaveBeenCalled();
  });

  it("ignores a failure of the HTTP message deletion", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(deleteHttpMessages).mockResolvedValue(new Error("error"));

    expect(await deleteSsoFlow("sso-trace-1")).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });
});
