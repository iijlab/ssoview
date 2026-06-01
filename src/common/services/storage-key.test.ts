/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { makeStorageKey, makeStorageKeyPrefix } from "./storage-key.ts";

describe("makeStorageKey", () => {
  it("joins namespace and segments with separator", () => {
    expect(makeStorageKey("ns", ["a", "b", "c"])).toBe("ns__a__b__c");
  });

  it("returns namespace only when segments is empty", () => {
    expect(makeStorageKey("ns", [])).toBe("ns");
  });

  it("handles single segment", () => {
    expect(makeStorageKey("http", ["123"])).toBe("http__123");
  });
});

describe("makeStorageKeyPrefix", () => {
  it("appends separator at the end", () => {
    expect(makeStorageKeyPrefix("ns", ["a", "b"])).toBe("ns__a__b__");
  });

  it("returns namespace with separator when segments is empty", () => {
    expect(makeStorageKeyPrefix("ns", [])).toBe("ns__");
  });

  it("handles single segment", () => {
    expect(makeStorageKeyPrefix("saml", ["456"])).toBe("saml__456__");
  });
});
