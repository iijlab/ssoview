/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { isSessionSummary, isSessionSummaryArray } from "./session-summary.ts";

describe("isSessionSummary", () => {
  const validSummary = {
    protocol: "saml",
    imported: false,
    capturing: true,
    sessionId: "abc123",
    warning: [],
  };

  it("returns true for valid SessionSummary with required fields only", () => {
    expect(isSessionSummary(validSummary)).toBe(true);
  });

  it("returns true for valid SessionSummary with all optional fields", () => {
    const summary = {
      ...validSummary,
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-01T01:00:00Z",
      sp: "sp.example.com",
      idp: "idp.example.org",
      status: "succeeded",
      action: "test action",
    };
    expect(isSessionSummary(summary)).toBe(true);
  });

  it("returns true for protocol oidc", () => {
    const summary = { ...validSummary, protocol: "oidc" };
    expect(isSessionSummary(summary)).toBe(true);
  });

  it("returns true for status in_progress", () => {
    const summary = { ...validSummary, status: "in_progress" };
    expect(isSessionSummary(summary)).toBe(true);
  });

  it("returns true for status failed", () => {
    const summary = { ...validSummary, status: "failed" };
    expect(isSessionSummary(summary)).toBe(true);
  });

  it("returns true for warning with strings", () => {
    const summary = { ...validSummary, warning: ["warning1", "warning2"] };
    expect(isSessionSummary(summary)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isSessionSummary(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSessionSummary(undefined)).toBe(false);
  });

  it("returns false when protocol is invalid", () => {
    const summary = { ...validSummary, protocol: "oauth" };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when imported is not a boolean", () => {
    const summary = { ...validSummary, imported: "false" };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when capturing is not a boolean", () => {
    const summary = { ...validSummary, capturing: 1 };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when sessionId is not a string", () => {
    const summary = { ...validSummary, sessionId: 123 };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when warning is not an array", () => {
    const summary = { ...validSummary, warning: "warning" };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when warning contains non-string", () => {
    const summary = { ...validSummary, warning: ["valid", 123] };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when status is invalid", () => {
    const summary = { ...validSummary, status: "unknown" };
    expect(isSessionSummary(summary)).toBe(false);
  });

  it("returns false when optional start is not a string", () => {
    const summary = { ...validSummary, start: 12345 };
    expect(isSessionSummary(summary)).toBe(false);
  });
});

describe("isSessionSummaryArray", () => {
  const validSummary = {
    protocol: "saml",
    imported: false,
    capturing: true,
    sessionId: "abc123",
    warning: [],
  };

  it("returns true for empty array", () => {
    expect(isSessionSummaryArray([])).toBe(true);
  });

  it("returns true for array with valid summaries", () => {
    expect(isSessionSummaryArray([validSummary, { ...validSummary, sessionId: "def456" }])).toBe(
      true,
    );
  });

  it("returns false for non-array", () => {
    expect(isSessionSummaryArray(validSummary)).toBe(false);
  });

  it("returns false for array with invalid item", () => {
    expect(isSessionSummaryArray([validSummary, { invalid: true }])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSessionSummaryArray(null)).toBe(false);
  });
});
