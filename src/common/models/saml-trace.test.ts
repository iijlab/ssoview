/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { isSamlTrace } from "./saml-trace.ts";

describe("isSamlTrace", () => {
  it("returns true for valid SamlTrace with required fields only", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
      step: 2,
      type: "IncomingAuthnRequest",
    };
    expect(isSamlTrace(msg)).toBe(true);
  });

  it("returns true for valid SamlTrace with optional fields", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: true,
      action: "test action",
      step: 3,
      type: "OutgoingAuthnRequest",
      date: "2026-01-01",
      sp: "sp.example.com",
      idp: "idp.example.org",
    };
    expect(isSamlTrace(msg)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSamlTrace(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSamlTrace(undefined)).toBe(false);
  });

  it("returns false when sessionId is missing", () => {
    const msg = {
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when sessionId is not a string", () => {
    const msg = {
      sessionId: 123,
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when createdAt is missing", () => {
    const msg = {
      sessionId: "abc123",
      imported: false,
      action: "test action",
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when imported is not a boolean", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: "false",
      action: "test action",
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when optional date is not a string", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
      date: 12345,
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when optional sp is not a string", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
      sp: null,
    };
    expect(isSamlTrace(msg)).toBe(false);
  });

  it("returns false when optional idp is not a string", () => {
    const msg = {
      sessionId: "abc123",
      createdAt: "2026-01-01T00:00:00Z",
      imported: false,
      action: "test action",
      idp: { name: "idp" },
    };
    expect(isSamlTrace(msg)).toBe(false);
  });
});
