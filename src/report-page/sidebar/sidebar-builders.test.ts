/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpMessage } from "@/common/models/http-message.ts";
import { buildHttpMessageDataRecord } from "./sidebar-builders.ts";

//
// Helpers
//

const baseFields = {
  createdAt: "2026-01-01T00:00:00Z",
  imported: false,
  requestId: "req-1",
  resourceType: "Document",
  headers: [],
  bodyStatus: "loaded",
  body: "",
};

function makeRequest(url: string, method = "GET"): HttpMessage {
  return {
    ...baseFields,
    stage: "Request",
    url,
    method,
  } as HttpMessage;
}

function makeResponse(url: string, statusCode: number, method = "GET"): HttpMessage {
  return {
    ...baseFields,
    stage: "Response",
    url,
    method,
    statusCode,
  } as unknown as HttpMessage;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

//
// Tests
//

const SP_HOST = "sp.example.com";
const IDP_HOST = "idp.example.org";

describe("buildHttpMessageDataRecord", () => {
  it("returns empty record when messages are empty", () => {
    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, {});

    expect(result).toEqual({});
  });

  it("builds data record preserving step keys", () => {
    const messages: Record<number, HttpMessage> = {
      0: makeRequest("https://sp.example.com/login"),
      1: makeResponse("https://sp.example.com/login", 302),
      2: makeRequest("https://idp.example.org/sso"),
    };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(Object.keys(result)).toHaveLength(3);
    expect(result[0]).toBeDefined();
    expect(result[1]).toBeDefined();
    expect(result[2]).toBeDefined();
  });

  it("sets from/to for request to SP", () => {
    const messages = { 0: makeRequest("https://sp.example.com/login") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.from).toBe("user");
    expect(result[0]!.to).toBe("sp");
  });

  it("sets from/to for request to IdP", () => {
    const messages = {
      0: makeRequest("https://sp.example.com/login"),
      1: makeRequest("https://idp.example.org/sso"),
    };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[1]!.from).toBe("user");
    expect(result[1]!.to).toBe("idp");
  });

  it("sets from/to for response from SP", () => {
    const messages = {
      0: makeRequest("https://sp.example.com/login"),
      1: makeResponse("https://sp.example.com/login", 302),
    };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[1]!.from).toBe("sp");
    expect(result[1]!.to).toBe("user");
  });

  it("sets from/to for response from IdP", () => {
    const messages = {
      0: makeRequest("https://sp.example.com/login"),
      1: makeResponse("https://idp.example.org/sso", 200),
    };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[1]!.from).toBe("idp");
    expect(result[1]!.to).toBe("user");
  });

  it("builds description for request as method + pathname", () => {
    const messages = { 0: makeRequest("https://sp.example.com/login/callback", "POST") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.description).toBe("POST /login/callback");
  });

  it("builds description for response as statusCode + statusText", () => {
    const messages = {
      0: makeRequest("https://sp.example.com/login"),
      1: makeResponse("https://sp.example.com/login", 200),
    };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[1]!.description).toBe("200 OK");
  });

  it("sets timestamp from createdAt", () => {
    const messages = { 0: makeRequest("https://sp.example.com/login") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.timestamp).toBe("2026-01-01T00:00:00Z");
  });

  it("warns and falls back to SP side for unexpected host", () => {
    const messages = { 0: makeRequest("https://unknown.example.com/path") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.from).toBe("user");
    expect(result[0]!.to).toBe("sp");
    expect(console.info).toHaveBeenCalled();
  });

  it("matches IdP host even when URL includes a non-standard port", () => {
    const messages = { 0: makeRequest("https://idp.example.org:8443/sso") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.from).toBe("user");
    expect(result[0]!.to).toBe("idp");
    expect(console.info).not.toHaveBeenCalled();
  });

  it("matches SP host even when URL includes a non-standard port", () => {
    const messages = { 0: makeRequest("https://sp.example.com:8443/login") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]!.from).toBe("user");
    expect(result[0]!.to).toBe("sp");
    expect(console.info).not.toHaveBeenCalled();
  });

  it("warns and falls back when URL cannot be parsed", () => {
    const messages = { 0: makeRequest("not a valid url") };

    const result = buildHttpMessageDataRecord(SP_HOST, IDP_HOST, messages);

    expect(result[0]).toBeDefined();
    expect(console.warn).toHaveBeenCalled();
  });
});
