/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { newHttpArchive, parseHttpArchive, toHttpArchiveJson } from "./http-archive.ts";

function makeRequest(): HttpMessage {
  return {
    id: "msg-1",
    tracingSessionId: "cs-1",
    observedAt: "2026-01-01T00:00:00Z",
    tabId: 1,
    fetchRequestId: "req-1",
    url: "https://sp.example.com/",
    method: "GET",
    headers: [],
    body: undefined,
    type: "Request",
  } as HttpMessage;
}

describe("newHttpArchive", () => {
  it("wraps the messages with the format version", () => {
    const httpMessages = [makeRequest()];

    expect(newHttpArchive(httpMessages)).toEqual({ version: 1, httpMessages });
  });
});

describe("toHttpArchiveJson", () => {
  it("serializes the archive as JSON", () => {
    const httpArchive = newHttpArchive([makeRequest()]);

    expect(JSON.parse(toHttpArchiveJson(httpArchive))).toEqual(httpArchive);
  });
});

describe("parseHttpArchive", () => {
  it("returns the archive the JSON was made from", () => {
    const httpArchive = newHttpArchive([makeRequest()]);

    expect(parseHttpArchive(toHttpArchiveJson(httpArchive))).toEqual(httpArchive);
  });

  it("returns Error when the JSON is malformed", () => {
    const result = parseHttpArchive("{");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Failed to parse HTTP archive");
  });

  it("returns Error when the JSON is not an archive", () => {
    const result = parseHttpArchive('{"version":1}');

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Invalid HTTP archive");
  });

  it("returns Error when a message is invalid", () => {
    const result = parseHttpArchive('{"version":1,"httpMessages":[{"id":"msg-1"}]}');

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Invalid HTTP archive");
  });
});
