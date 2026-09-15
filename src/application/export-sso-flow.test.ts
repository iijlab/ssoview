/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { newHttpArchive, toHttpArchiveJson } from "@/core/http/http-archive.ts";
import { type HttpMessage } from "@/core/http/http-message.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { getHttpMessagesBySsoTraceId } from "@/core/sso/sso-trace-query.ts";
import { findSsoTraceById } from "@/core/sso/sso-trace-repository.ts";
import { exportSsoFlow } from "./export-sso-flow.ts";

vi.mock("@/core/http/http-archive.ts", () => ({
  newHttpArchive: vi.fn(),
  toHttpArchiveJson: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-query.ts", () => ({
  getHttpMessagesBySsoTraceId: vi.fn(),
}));

vi.mock("@/core/sso/sso-trace-repository.ts", () => ({
  findSsoTraceById: vi.fn(),
}));

const ssoTrace: SsoTrace = {
  id: "sso-trace-1",
  tracingSessionId: "tracing-session-1",
  protocol: "saml",
  correlationKey: "correlation-key-1",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("exportSsoFlow", () => {
  it("returns HTTP archive JSON on success", async () => {
    const httpMessages = [{} as HttpMessage];
    vi.mocked(findSsoTraceById).mockResolvedValue(ssoTrace);
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(httpMessages);
    const httpArchive = { version: 1, httpMessages };
    vi.mocked(newHttpArchive).mockReturnValue(httpArchive);
    vi.mocked(toHttpArchiveJson).mockReturnValue('{"log":{}}');

    const result = await exportSsoFlow("sso-trace-1");

    expect(findSsoTraceById).toHaveBeenCalledWith("sso-trace-1");
    expect(getHttpMessagesBySsoTraceId).toHaveBeenCalledWith("sso-trace-1");
    expect(newHttpArchive).toHaveBeenCalledWith(httpMessages);
    expect(toHttpArchiveJson).toHaveBeenCalledWith(httpArchive);
    expect(result).toBe('{"log":{}}');
  });

  it("returns Error when the SSO trace cannot be found", async () => {
    const error = new Error("error");
    vi.mocked(findSsoTraceById).mockResolvedValue(error);

    const result = await exportSsoFlow("sso-trace-1");

    expect(result).toBe(error);
    expect(getHttpMessagesBySsoTraceId).not.toHaveBeenCalled();
  });

  it("returns Error when no SSO trace has the ID", async () => {
    vi.mocked(findSsoTraceById).mockResolvedValue(undefined);

    const result = await exportSsoFlow("sso-trace-1");

    expect(result).toBeInstanceOf(Error);
    expect(getHttpMessagesBySsoTraceId).not.toHaveBeenCalled();
  });

  it("returns Error when getHttpMessagesBySsoTraceId fails", async () => {
    vi.mocked(findSsoTraceById).mockResolvedValue(ssoTrace);
    const error = new Error("error");
    vi.mocked(getHttpMessagesBySsoTraceId).mockResolvedValue(error);

    const result = await exportSsoFlow("sso-trace-1");

    expect(result).toBe(error);
    expect(newHttpArchive).not.toHaveBeenCalled();
  });
});
