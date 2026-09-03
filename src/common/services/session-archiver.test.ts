/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { newHar, toHttpMessages } from "@/common/models/http-archive.ts";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { saveEventRecord } from "@/common/services/event-store.ts";
import { findHttpMessagesOfFlow } from "@/common/services/flow-query.ts";
import { storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { recordSamlTrace } from "@/common/services/saml-recorder.ts";
import { dumpSessionArchive, loadSessionArchive } from "./session-archiver.ts";

vi.mock("@/common/models/http-archive.ts", () => ({
  newHar: vi.fn(),
  toHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/event-store.ts", () => ({
  saveEventRecord: vi.fn(),
}));

vi.mock("@/common/services/flow-query.ts", () => ({
  findHttpMessagesOfFlow: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStepFromHttpRequest: vi.fn(),
  detectSamlStepFromHttpResponse: vi.fn(),
}));

vi.mock("@/common/services/saml-recorder.ts", () => ({
  recordSamlTrace: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(saveEventRecord).mockResolvedValue(undefined);
});

describe("dumpSessionArchive", () => {
  it("returns HAR string on success", async () => {
    const httpMessages = [{} as HttpMessage];
    vi.mocked(findHttpMessagesOfFlow).mockResolvedValue(httpMessages);
    vi.mocked(newHar).mockReturnValue('{"log":{}}');

    const result = await dumpSessionArchive(1, "session-1");

    expect(findHttpMessagesOfFlow).toHaveBeenCalledWith(1, "session-1");
    expect(newHar).toHaveBeenCalledWith(httpMessages);
    expect(result).toBe('{"log":{}}');
  });

  it("returns Error when findHttpMessagesOfFlow fails", async () => {
    vi.mocked(findHttpMessagesOfFlow).mockResolvedValue(new Error("storage error"));

    const result = await dumpSessionArchive(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("storage error");
    expect(newHar).not.toHaveBeenCalled();
  });
});

describe("loadSessionArchive", () => {
  it("returns session IDs on success", async () => {
    const httpMessage = {
      stage: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual(["session-1"]);
    expect(storeHttpMessage).toHaveBeenCalledWith(httpMessage, 1, "session-1");
    expect(recordSamlTrace).toHaveBeenCalledWith(
      expect.any(String),
      1,
      { step: 3, correlationKey: "session-1" },
      httpMessage,
      undefined,
    );
  });

  it("stores the paired request of a response ", async () => {
    const pairedRequest = {
      id: "msg-1",
      stage: "Request",
      url: "https://sp.example.com/resource",
    } as unknown as HttpMessage;
    const httpMessage = {
      id: "msg-2",
      stage: "Response",
      pairedHttpRequestId: "msg-1",
      url: "https://sp.example.com/acs",
      headers: [],
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([pairedRequest, httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      step: 6,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    await loadSessionArchive(1, "har-string");

    expect(detectSamlStepFromHttpResponse).toHaveBeenCalledWith(httpMessage, pairedRequest);
    expect(storeHttpMessage).toHaveBeenCalledTimes(2);
    expect(storeHttpMessage).toHaveBeenNthCalledWith(1, pairedRequest, 1, "session-1");
    expect(storeHttpMessage).toHaveBeenNthCalledWith(2, httpMessage, 1, "session-1");
    expect(recordSamlTrace).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      1,
      { step: 6, correlationKey: "session-1" },
      httpMessage,
      pairedRequest,
    );
  });

  it("skips a response whose paired request is missing from the archive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpMessage = {
      id: "msg-2",
      stage: "Response",
      pairedHttpRequestId: "msg-1",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual([]);
    expect(detectSamlStepFromHttpResponse).not.toHaveBeenCalled();
    expect(storeHttpMessage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("records the traces under the imported capture session", async () => {
    const httpMessage = {
      stage: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    await loadSessionArchive(1, "har-string");

    const importedRecord = vi.mocked(saveEventRecord).mock.calls[0]![0];
    expect(vi.mocked(recordSamlTrace).mock.calls[0]![0]).toBe(importedRecord.id);
  });

  it("aborts when a trace cannot be recorded", async () => {
    const httpMessage = {
      stage: "Request",
      url: "https://idp.example.org/sso",
      method: "GET",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    const error = new Error("record error");
    vi.mocked(recordSamlTrace).mockResolvedValue(error);

    expect(await loadSessionArchive(1, "har-string")).toBe(error);
  });

  it("records the import as an event", async () => {
    vi.mocked(toHttpMessages).mockReturnValue([]);

    await loadSessionArchive(1, "har-string");

    expect(saveEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "ArchiveImported" }),
    );
  });

  it("returns Error when toHttpMessages fails", async () => {
    vi.mocked(toHttpMessages).mockReturnValue(new Error("parse error"));

    const result = await loadSessionArchive(1, "invalid");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("parse error");
    expect(saveEventRecord).not.toHaveBeenCalled();
  });

  it("returns Error when the import event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(toHttpMessages).mockReturnValue([]);
    vi.mocked(saveEventRecord).mockResolvedValue(error);

    expect(await loadSessionArchive(1, "har-string")).toBe(error);
    expect(detectSamlStepFromHttpRequest).not.toHaveBeenCalled();
  });

  it("returns empty array when no SAML steps are detected", async () => {
    const httpMessage = { stage: "Request" } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual([]);
  });

  it("returns deduplicated session IDs", async () => {
    const httpMessages = [
      { stage: "Request", url: "https://idp.example.org/sso" },
      { stage: "Request", url: "https://idp.example.org/sso" },
    ] as unknown as HttpMessage[];
    vi.mocked(toHttpMessages).mockReturnValue(httpMessages);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      step: 3,
      correlationKey: "session-1",
    });
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(recordSamlTrace).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual(["session-1"]);
  });
});
