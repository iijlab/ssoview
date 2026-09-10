/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { describe, expect, it } from "vitest";
import { isSsoProtocol, isSsoTrace, newSsoTrace } from "./flow-entry.ts";

describe("newSsoTrace", () => {
  it("creates an SSO trace with the given attributes", () => {
    const ssoTrace = newSsoTrace("cs-1", "saml", "_authn-request-id");

    expect(ssoTrace.tracingSessionId).toBe("cs-1");
    expect(ssoTrace.protocol).toBe("saml");
    expect(ssoTrace.correlationKey).toBe("_authn-request-id");
  });

  it("issues a UUIDv7 as the ID", () => {
    const ssoTrace = newSsoTrace("cs-1", "saml", "_authn-request-id");

    expect(uuidValidate(ssoTrace.id)).toBe(true);
    expect(uuidVersion(ssoTrace.id)).toBe(7);
  });

  it("issues a distinct ID for each SSO trace", () => {
    const first = newSsoTrace("cs-1", "saml", "_authn-request-id");
    const second = newSsoTrace("cs-1", "saml", "_authn-request-id");

    expect(first.id).not.toBe(second.id);
  });
});

describe("isSsoTrace", () => {
  it("accepts an SSO trace created by newSsoTrace", () => {
    expect(isSsoTrace(newSsoTrace("cs-1", "saml", "_authn-request-id"))).toBe(true);
  });

  it("rejects a value with an unknown protocol", () => {
    expect(isSsoTrace({ ...newSsoTrace("cs-1", "saml", "key"), protocol: "kerberos" })).toBe(false);
  });

  it.each([
    ["id", { tracingSessionId: "cs-1", protocol: "saml", correlationKey: "key" }],
    ["tracingSessionId", { id: "id", protocol: "saml", correlationKey: "key" }],
    ["protocol", { id: "id", tracingSessionId: "cs-1", correlationKey: "key" }],
    ["correlationKey", { id: "id", tracingSessionId: "cs-1", protocol: "saml" }],
  ])("rejects a value without %s", (_attribute, value) => {
    expect(isSsoTrace(value)).toBe(false);
  });

  it.each([null, undefined, "flow", 1])("rejects non-object value %s", (value) => {
    expect(isSsoTrace(value)).toBe(false);
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
