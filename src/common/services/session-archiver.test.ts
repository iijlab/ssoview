/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { newHar, toHttpMessages } from "@/common/models/http-archive.ts";
import type { HttpMessage } from "@/common/models/http-message.ts";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { storeEventRecord } from "@/common/services/event-store.ts";
import { retrieveHttpMessages, storeHttpMessage } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
} from "@/common/services/saml-detector.ts";
import { storeSamlTrace } from "@/common/services/saml-store.ts";
import { dumpSessionArchive, loadSessionArchive } from "./session-archiver.ts";

vi.mock("@/common/models/http-archive.ts", () => ({
  newHar: vi.fn(),
  toHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/event-store.ts", () => ({
  storeEventRecord: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  retrieveHttpMessages: vi.fn(),
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStepFromHttpRequest: vi.fn(),
  detectSamlStepFromHttpResponse: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  storeSamlTrace: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storeEventRecord).mockResolvedValue(undefined);
});

describe("dumpSessionArchive", () => {
  it("returns HAR string on success", async () => {
    const httpMessages = [{} as HttpMessage];
    vi.mocked(retrieveHttpMessages).mockResolvedValue(httpMessages);
    vi.mocked(newHar).mockReturnValue('{"log":{}}');

    const result = await dumpSessionArchive(1, "session-1");

    expect(retrieveHttpMessages).toHaveBeenCalledWith(1, "session-1");
    expect(newHar).toHaveBeenCalledWith(httpMessages);
    expect(result).toBe('{"log":{}}');
  });

  it("returns Error when retrieveHttpMessages fails", async () => {
    vi.mocked(retrieveHttpMessages).mockResolvedValue(new Error("storage error"));

    const result = await dumpSessionArchive(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("storage error");
    expect(newHar).not.toHaveBeenCalled();
  });
});

describe("loadSessionArchive", () => {
  it("returns session IDs on success", async () => {
    const httpMessage = { stage: "Request", imported: false } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      sessionId: "session-1",
      step: 3,
    } as unknown as SamlTrace);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual(["session-1"]);
    expect(storeHttpMessage).toHaveBeenCalledWith(
      { ...httpMessage, imported: true },
      1,
      "session-1",
    );
    expect(storeSamlTrace).toHaveBeenCalledWith(
      { sessionId: "session-1", step: 3, imported: true },
      1,
    );
  });

  it("stores the paired request of a response as an imported message", async () => {
    const pairedRequest = {
      id: "msg-1",
      stage: "Request",
      imported: false,
      url: "https://sp.example.com/resource",
    } as unknown as HttpMessage;
    const httpMessage = {
      id: "msg-2",
      stage: "Response",
      imported: false,
      pairedHttpRequestId: "msg-1",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([pairedRequest, httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);
    vi.mocked(detectSamlStepFromHttpResponse).mockResolvedValue({
      sessionId: "session-1",
      step: 6,
    } as unknown as SamlTrace);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    await loadSessionArchive(1, "har-string");

    expect(detectSamlStepFromHttpResponse).toHaveBeenCalledWith(httpMessage, pairedRequest);
    expect(storeHttpMessage).toHaveBeenCalledTimes(2);
    expect(storeHttpMessage).toHaveBeenNthCalledWith(
      1,
      { ...pairedRequest, imported: true },
      1,
      "session-1",
    );
    expect(storeHttpMessage).toHaveBeenNthCalledWith(
      2,
      { ...httpMessage, imported: true },
      1,
      "session-1",
    );
  });

  it("skips a response whose paired request is missing from the archive", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpMessage = {
      id: "msg-2",
      stage: "Response",
      imported: false,
      pairedHttpRequestId: "msg-1",
    } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual([]);
    expect(detectSamlStepFromHttpResponse).not.toHaveBeenCalled();
    expect(storeHttpMessage).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("records the import as an event", async () => {
    vi.mocked(toHttpMessages).mockReturnValue([]);

    await loadSessionArchive(1, "har-string");

    expect(storeEventRecord).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "ArchiveImported" }),
    );
  });

  it("returns Error when toHttpMessages fails", async () => {
    vi.mocked(toHttpMessages).mockReturnValue(new Error("parse error"));

    const result = await loadSessionArchive(1, "invalid");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("parse error");
    expect(storeEventRecord).not.toHaveBeenCalled();
  });

  it("returns Error when the import event cannot be stored", async () => {
    const error = new Error("storage failed");
    vi.mocked(toHttpMessages).mockReturnValue([]);
    vi.mocked(storeEventRecord).mockResolvedValue(error);

    expect(await loadSessionArchive(1, "har-string")).toBe(error);
    expect(detectSamlStepFromHttpRequest).not.toHaveBeenCalled();
  });

  it("returns empty array when no SAML traces are detected", async () => {
    const httpMessage = { stage: "Request", imported: false } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual([]);
  });

  it("returns deduplicated session IDs", async () => {
    const httpMessages = [
      { stage: "Request", imported: false },
      { stage: "Request", imported: false },
    ] as unknown as HttpMessage[];
    vi.mocked(toHttpMessages).mockReturnValue(httpMessages);
    vi.mocked(detectSamlStepFromHttpRequest).mockResolvedValue({
      sessionId: "session-1",
      step: 3,
    } as unknown as SamlTrace);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual(["session-1"]);
  });
});
