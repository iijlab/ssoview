/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { describe, expect, it } from "vitest";
import { isSsoProtocol, isSsoTrace, newSsoTrace } from "./flow-entry.ts";

describe("newSsoTrace", () => {
  it("creates an SSO trace with the given attributes", () => {
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");

    expect(ssoTrace.tracingSessionId).toBe("tracing-session-1");
    expect(ssoTrace.protocol).toBe("saml");
    expect(ssoTrace.correlationKey).toBe("correlation-key-1");
  });

  it("assigns a UUIDv7 as the ID", () => {
    const ssoTrace = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");

    expect(uuidValidate(ssoTrace.id)).toBe(true);
    expect(uuidVersion(ssoTrace.id)).toBe(7);
  });

  it("assigns a distinct ID to each SSO trace", () => {
    const first = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");
    const second = newSsoTrace("tracing-session-1", "saml", "correlation-key-1");

    expect(first.id).not.toBe(second.id);
  });
});

describe("isSsoTrace", () => {
  it("accepts an SSO trace created by newSsoTrace", () => {
    expect(isSsoTrace(newSsoTrace("tracing-session-1", "saml", "correlation-key-1"))).toBe(true);
  });

  it("rejects a value with an unknown protocol", () => {
    expect(
      isSsoTrace({
        ...newSsoTrace("tracing-session-1", "saml", "correlation-key-1"),
        protocol: "kerberos",
      }),
    ).toBe(false);
  });

  it.each([
    [
      "id",
      {
        tracingSessionId: "tracing-session-1",
        protocol: "saml",
        correlationKey: "correlation-key-1",
      },
    ],
    ["tracingSessionId", { id: "id", protocol: "saml", correlationKey: "correlation-key-1" }],
    [
      "protocol",
      { id: "id", tracingSessionId: "tracing-session-1", correlationKey: "correlation-key-1" },
    ],
    ["correlationKey", { id: "id", tracingSessionId: "tracing-session-1", protocol: "saml" }],
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
