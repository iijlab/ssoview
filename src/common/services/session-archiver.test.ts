/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpMessage } from "@/common/models/http-message.ts";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { dumpSessionArchive, loadSessionArchive } from "./session-archiver.ts";

vi.mock("@/common/models/http-archive.ts", () => ({
  newHar: vi.fn(),
  toHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/http-store.ts", () => ({
  retrieveHttpMessages: vi.fn(),
  storeHttpMessage: vi.fn(),
}));

vi.mock("@/common/services/saml-detector.ts", () => ({
  detectSamlStep: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  storeSamlTrace: vi.fn(),
}));

const { newHar, toHttpMessages } = await import("@/common/models/http-archive.ts");
const { retrieveHttpMessages, storeHttpMessage } = await import("@/common/services/http-store.ts");
const { detectSamlStep } = await import("@/common/services/saml-detector.ts");
const { storeSamlTrace } = await import("@/common/services/saml-store.ts");

beforeEach(() => {
  vi.resetAllMocks();
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
    vi.mocked(detectSamlStep).mockResolvedValue({
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

  it("returns Error when toHttpMessages fails", async () => {
    vi.mocked(toHttpMessages).mockReturnValue(new Error("parse error"));

    const result = await loadSessionArchive(1, "invalid");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("parse error");
  });

  it("returns empty array when no SAML traces are detected", async () => {
    const httpMessage = { stage: "Request", imported: false } as unknown as HttpMessage;
    vi.mocked(toHttpMessages).mockReturnValue([httpMessage]);
    vi.mocked(detectSamlStep).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual([]);
  });

  it("returns deduplicated session IDs", async () => {
    const httpMessages = [
      { stage: "Request", imported: false },
      { stage: "Request", imported: false },
    ] as unknown as HttpMessage[];
    vi.mocked(toHttpMessages).mockReturnValue(httpMessages);
    vi.mocked(detectSamlStep).mockResolvedValue({
      sessionId: "session-1",
      step: 3,
    } as unknown as SamlTrace);
    vi.mocked(storeHttpMessage).mockResolvedValue(undefined);
    vi.mocked(storeSamlTrace).mockResolvedValue(undefined);

    const result = await loadSessionArchive(1, "har-string");

    expect(result).toEqual(["session-1"]);
  });
});
