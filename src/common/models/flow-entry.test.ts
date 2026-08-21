/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { describe, expect, it } from "vitest";
import { isFlowEntry, isSsoProtocol, newFlowEntry } from "./flow-entry.ts";

describe("newFlowEntry", () => {
  it("creates a flow with the given attributes", () => {
    const flow = newFlowEntry("cs-1", "saml", "_authn-request-id");

    expect(flow.captureSessionId).toBe("cs-1");
    expect(flow.protocol).toBe("saml");
    expect(flow.correlationKey).toBe("_authn-request-id");
  });

  it("issues a UUIDv7 as the ID", () => {
    const flow = newFlowEntry("cs-1", "saml", "_authn-request-id");

    expect(uuidValidate(flow.id)).toBe(true);
    expect(uuidVersion(flow.id)).toBe(7);
  });

  it("issues a distinct ID for each flow", () => {
    const first = newFlowEntry("cs-1", "saml", "_authn-request-id");
    const second = newFlowEntry("cs-1", "saml", "_authn-request-id");

    expect(first.id).not.toBe(second.id);
  });
});

describe("isFlowEntry", () => {
  it("accepts a flow created by newFlowEntry", () => {
    expect(isFlowEntry(newFlowEntry("cs-1", "saml", "_authn-request-id"))).toBe(true);
  });

  it("rejects a value with an unknown protocol", () => {
    expect(isFlowEntry({ ...newFlowEntry("cs-1", "saml", "key"), protocol: "kerberos" })).toBe(
      false,
    );
  });

  it.each([
    ["id", { captureSessionId: "cs-1", protocol: "saml", correlationKey: "key" }],
    ["captureSessionId", { id: "id", protocol: "saml", correlationKey: "key" }],
    ["protocol", { id: "id", captureSessionId: "cs-1", correlationKey: "key" }],
    ["correlationKey", { id: "id", captureSessionId: "cs-1", protocol: "saml" }],
  ])("rejects a value without %s", (_attribute, value) => {
    expect(isFlowEntry(value)).toBe(false);
  });

  it.each([null, undefined, "flow", 1])("rejects non-object value %s", (value) => {
    expect(isFlowEntry(value)).toBe(false);
  });
});

describe("isSsoProtocol", () => {
  it.each(["saml", "oidc"])("accepts %s", (value) => {
    expect(isSsoProtocol(value)).toBe(true);
  });

  it.each(["SAML", "kerberos", "", undefined])("rejects %s", (value) => {
    expect(isSsoProtocol(value)).toBe(false);
  });
});
