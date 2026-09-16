/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseHttpArchiveJson } from "@/core/http/http-archive.ts";
import { type HttpMessage } from "@/core/http/http-message.ts";
import { saveHttpMessage } from "@/core/http/http-message-repository.ts";
import { recordSamlLog } from "@/core/sso/saml-log-recorder.ts";
import {
  detectSamlSignalFromHttpRequest,
  detectSamlSignalFromHttpResponse,
} from "@/core/sso/saml-signal-detector.ts";
import { type SsoTrace } from "@/core/sso/sso-trace.ts";
import { saveTracingLifecycleEvent } from "@/core/tracing/tracing-event-repository.ts";
import { importHttpArchive } from "./import-http-archive.ts";

vi.mock("@/core/http/http-archive.ts", () => ({
  parseHttpArchiveJson: vi.fn(),
}));

vi.mock("@/core/tracing/tracing-event-repository.ts", () => ({
  saveTracingLifecycleEvent: vi.fn(),
}));

vi.mock("@/core/http/http-message-repository.ts", () => ({
  saveHttpMessage: vi.fn(),
}));

vi.mock("@/core/sso/saml-signal-detector.ts", () => ({
  detectSamlSignalFromHttpRequest: vi.fn(),
  detectSamlSignalFromHttpResponse: vi.fn(),
}));

vi.mock("@/core/sso/saml-log-recorder.ts", () => ({
  recordSamlLog: vi.fn(),
}));

const importedSsoTrace: SsoTrace = {
  id: "sso-trace-imported",
  tracingSessionId: "tracing-session-imported",
  protocol: "saml",
  correlationKey: "correlation-key-1",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(undefined);
});

describe("importHttpArchive", () => {
  it("returns SSO flow IDs on success", async () => {
    const httpMessage = {
      type: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      type: "OutgoingSamlAuthnRequest",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(importedSsoTrace);

    const result = await importHttpArchive("http-archive-json");

    expect(result).toEqual(["sso-trace-imported"]);
    const importedEvent = vi.mocked(saveTracingLifecycleEvent).mock.calls[0]![0];
    const importedHttpMessage = { ...httpMessage, tracingSessionId: importedEvent.id };
    expect(saveHttpMessage).toHaveBeenCalledWith(importedHttpMessage);
    expect(recordSamlLog).toHaveBeenCalledWith(
      importedEvent.id,
      { type: "OutgoingSamlAuthnRequest", correlationKey: "correlation-key-1" },
      importedHttpMessage,
      undefined,
    );
  });

  it("assigns the imported tracing session and drops the observed tab and request ID", async () => {
    const httpMessage = {
      tracingSessionId: "tracing-session-exported",
      tabId: 7,
      fetchRequestId: "req-7",
      type: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      type: "OutgoingSamlAuthnRequest",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(importedSsoTrace);

    await importHttpArchive("http-archive-json");

    const importedEvent = vi.mocked(saveTracingLifecycleEvent).mock.calls[0]![0];
    expect(saveHttpMessage).toHaveBeenCalledExactlyOnceWith({
      tracingSessionId: importedEvent.id,
      type: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    });
  });

  it("saves the paired request of a response", async () => {
    const pairedRequest = {
      id: "msg-1",
      type: "Request",
      url: "https://sp.example.com/resource",
    } as unknown as HttpMessage;
    const httpMessage = {
      id: "msg-2",
      type: "Response",
      pairedHttpRequestId: "msg-1",
      url: "https://sp.example.com/acs",
      headers: [],
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({
      version: 1,
      httpMessages: [pairedRequest, httpMessage],
    });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(detectSamlSignalFromHttpResponse).mockResolvedValue({
      type: "AuthenticatedResourceResponse",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(importedSsoTrace);

    await importHttpArchive("http-archive-json");

    const importedEvent = vi.mocked(saveTracingLifecycleEvent).mock.calls[0]![0];
    const importedPairedRequest = { ...pairedRequest, tracingSessionId: importedEvent.id };
    const importedHttpMessage = { ...httpMessage, tracingSessionId: importedEvent.id };
    expect(detectSamlSignalFromHttpResponse).toHaveBeenCalledWith(
      importedHttpMessage,
      importedPairedRequest,
    );
    expect(saveHttpMessage).toHaveBeenCalledTimes(2);
    expect(saveHttpMessage).toHaveBeenNthCalledWith(1, importedPairedRequest);
    expect(saveHttpMessage).toHaveBeenNthCalledWith(2, importedHttpMessage);
    expect(recordSamlLog).toHaveBeenCalledExactlyOnceWith(
      importedEvent.id,
      { type: "AuthenticatedResourceResponse", correlationKey: "correlation-key-1" },
      importedHttpMessage,
      importedPairedRequest,
    );
  });

  it("skips a response whose paired request is missing from the archive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpMessage = {
      id: "msg-2",
      type: "Response",
      pairedHttpRequestId: "msg-1",
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });

    const result = await importHttpArchive("http-archive-json");

    expect(result).toEqual([]);
    expect(detectSamlSignalFromHttpResponse).not.toHaveBeenCalled();
    expect(saveHttpMessage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("records the logs under the imported tracing session", async () => {
    const httpMessage = {
      type: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      type: "OutgoingSamlAuthnRequest",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(importedSsoTrace);

    await importHttpArchive("http-archive-json");

    const importedEvent = vi.mocked(saveTracingLifecycleEvent).mock.calls[0]![0];
    expect(vi.mocked(recordSamlLog).mock.calls[0]![0]).toBe(importedEvent.id);
  });

  it("aborts when a log cannot be recorded", async () => {
    const httpMessage = {
      type: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      type: "OutgoingSamlAuthnRequest",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    const error = new Error("error");
    vi.mocked(recordSamlLog).mockResolvedValue(error);

    expect(await importHttpArchive("http-archive-json")).toBe(error);
  });

  it("records the import as an event", async () => {
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [] });

    await importHttpArchive("http-archive-json");

    expect(saveTracingLifecycleEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "ArchiveImported" }),
    );
  });

  it("returns Error when parseHttpArchiveJson fails", async () => {
    const error = new Error("error");
    vi.mocked(parseHttpArchiveJson).mockReturnValue(error);

    const result = await importHttpArchive("invalid");

    expect(result).toBe(error);
    expect(saveTracingLifecycleEvent).not.toHaveBeenCalled();
  });

  it("returns Error when the import event cannot be saved", async () => {
    const error = new Error("error");
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [] });
    vi.mocked(saveTracingLifecycleEvent).mockResolvedValue(error);

    expect(await importHttpArchive("http-archive-json")).toBe(error);
    expect(detectSamlSignalFromHttpRequest).not.toHaveBeenCalled();
  });

  it("returns empty array when no SAML steps are detected", async () => {
    const httpMessage = { type: "Request" } as unknown as HttpMessage;
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages: [httpMessage] });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue(undefined);

    const result = await importHttpArchive("http-archive-json");

    expect(result).toEqual([]);
  });

  it("returns deduplicated SSO flow IDs", async () => {
    const httpMessages = [
      { type: "Request", url: "https://idp.example.org/sso" },
      { type: "Request", url: "https://idp.example.org/sso" },
    ] as unknown as HttpMessage[];
    vi.mocked(parseHttpArchiveJson).mockReturnValue({ version: 1, httpMessages });
    vi.mocked(detectSamlSignalFromHttpRequest).mockResolvedValue({
      type: "OutgoingSamlAuthnRequest",
      correlationKey: "correlation-key-1",
    });
    vi.mocked(saveHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlLog).mockResolvedValue(importedSsoTrace);

    const result = await importHttpArchive("http-archive-json");

    expect(result).toEqual(["sso-trace-imported"]);
  });
});
