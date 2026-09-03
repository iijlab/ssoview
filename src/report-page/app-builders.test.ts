/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { Base64 } from "js-base64";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SamlTrace } from "@/common/models/saml-trace.ts";
import {
  buildHttpMessageRecord,
  getSamlAuthnRequestXml,
  getSamlResponseXml,
} from "./app-builders.ts";

//
// Helpers
//

function makeHttpMessage(id: string): HttpMessage {
  return {
    id,
    observedAt: "2026-01-01T00:00:00Z",
    stage: "Request",
    captureSessionId: "cs-1",
    tabId: 1,
    fetchRequestId: "req-1",
    url: "https://sp.example.com/",
    method: "GET",
    headers: [],
    body: "",
  };
}

function makePostRequest(id: string, body: string): HttpMessage {
  return {
    ...makeHttpMessage(id),
    method: "POST",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body,
  };
}

function makeSamlTrace(id: string, step: SamlTrace["step"], httpMessageId: string): SamlTrace {
  return {
    id,
    flowId: "flow-1",
    httpMessageId,
    observedAt: "2026-01-01T00:00:00Z",
    serverHostname: "sp.example.com",
    sessionId: "corr-1",
    action: "test action",
    step,
    type: "UnauthenticatedResourceRequest",
  } as SamlTrace;
}

//
// Tests
//

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("buildHttpMessageRecord", () => {
  it("maps each SAML step to the HTTP message referenced by its trace", () => {
    const msg1 = makeHttpMessage("msg-1");
    const msg2 = makeHttpMessage("msg-2");

    const result = buildHttpMessageRecord(
      [makeSamlTrace("trace-1", 1, "msg-1"), makeSamlTrace("trace-2", 2, "msg-2")],
      [msg1, msg2],
    );

    expect(result).toEqual({ 1: msg1, 2: msg2 });
  });

  it("keeps the last trace when the same step appears more than once", () => {
    const msg1 = makeHttpMessage("msg-1");
    const msg2 = makeHttpMessage("msg-2");

    const result = buildHttpMessageRecord(
      [makeSamlTrace("trace-1", 4, "msg-1"), makeSamlTrace("trace-2", 4, "msg-2")],
      [msg1, msg2],
    );

    expect(result).toEqual({ 4: msg2 });
    expect(console.info).toHaveBeenCalledOnce();
  });

  it("skips a trace whose HTTP message is missing", () => {
    const msg2 = makeHttpMessage("msg-2");

    const result = buildHttpMessageRecord(
      [makeSamlTrace("trace-1", 1, "msg-1"), makeSamlTrace("trace-2", 2, "msg-2")],
      [msg2],
    );

    expect(result).toEqual({ 2: msg2 });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("returns an empty record when there are no traces", () => {
    expect(buildHttpMessageRecord([], [makeHttpMessage("msg-1")])).toEqual({});
  });
});

describe("getSamlAuthnRequestXml", () => {
  const xml2 = '<samlp:AuthnRequest ID="from-step-2"/>';
  const xml3 = '<samlp:AuthnRequest ID="from-step-3"/>';
  const step2 = makePostRequest("msg-2", `SAMLRequest=${encodeURIComponent(Base64.encode(xml2))}`);
  const step3 = makePostRequest("msg-3", `SAMLRequest=${encodeURIComponent(Base64.encode(xml3))}`);

  it("extracts from step 2 when present", async () => {
    expect(await getSamlAuthnRequestXml({ 2: step2, 3: step3 })).toBe(xml2);
  });

  it("falls back to step 3 when step 2 is missing", async () => {
    expect(await getSamlAuthnRequestXml({ 3: step3 })).toBe(xml3);
  });

  it("returns undefined when neither step is present", async () => {
    expect(await getSamlAuthnRequestXml({ 1: makeHttpMessage("msg-1") })).toBeUndefined();
  });
});

describe("getSamlResponseXml", () => {
  const xml4 = '<samlp:Response ID="from-step-4"/>';
  const xml5 = '<samlp:Response ID="from-step-5"/>';
  const step4 = makePostRequest("msg-4", `SAMLResponse=${encodeURIComponent(Base64.encode(xml4))}`);
  const step5 = makePostRequest("msg-5", `SAMLResponse=${encodeURIComponent(Base64.encode(xml5))}`);

  it("extracts from step 4 when present", async () => {
    expect(await getSamlResponseXml({ 4: step4, 5: step5 })).toBe(xml4);
  });

  it("falls back to step 5 when step 4 is missing", async () => {
    expect(await getSamlResponseXml({ 5: step5 })).toBe(xml5);
  });

  it("returns undefined when neither step is present", async () => {
    expect(await getSamlResponseXml({ 6: makeHttpMessage("msg-6") })).toBeUndefined();
  });
});
