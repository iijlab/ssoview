/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it, vi } from "vitest";
import { createLabeledLogger } from "./labeled-logger.ts";

describe("createLabeledLogger", () => {
  it("returns original logger when labels is empty", async () => {
    const mockLogger = vi.fn();
    const result = await createLabeledLogger(mockLogger, []);
    expect(result).toBe(mockLogger);
  });

  it("returns bound logger with format and styles for single label", async () => {
    const mockLogger = vi.fn();
    const labeledLogger = await createLabeledLogger(mockLogger, ["TEST"]);

    labeledLogger("message", { data: 123 });

    expect(mockLogger).toHaveBeenCalledTimes(1);
    const args = mockLogger.mock.calls[0]!;

    // First arg is format string with %c placeholders
    expect(args[0]).toBe("%cTEST%c");
    // Second arg is style (background color, padding, etc.)
    expect(args[1]).toMatch(/padding.*background-color.*#[0-9a-f]{6}/i);
    // Third arg is reset style (empty string)
    expect(args[2]).toBe("");
    // Remaining args are the actual log arguments
    expect(args[3]).toBe("message");
    expect(args[4]).toEqual({ data: 123 });
  });

  it("returns bound logger with format and styles for multiple labels", async () => {
    const mockLogger = vi.fn();
    const labeledLogger = await createLabeledLogger(mockLogger, ["HTTP", "req-123", "GET"]);

    labeledLogger("https://example.com");

    expect(mockLogger).toHaveBeenCalledTimes(1);
    const args = mockLogger.mock.calls[0]!;

    // Format string with all labels
    expect(args[0]).toBe("%cHTTP%c %creq-123%c %cGET%c");
    // 3 labels = 6 style args (style, reset, style, reset, style, reset)
    expect(args[1]).toMatch(/background-color/);
    expect(args[2]).toBe("");
    expect(args[3]).toMatch(/background-color/);
    expect(args[4]).toBe("");
    expect(args[5]).toMatch(/background-color/);
    expect(args[6]).toBe("");
    // Actual log argument
    expect(args[7]).toBe("https://example.com");
  });

  it("generates consistent colors for the same label", async () => {
    const mockLogger1 = vi.fn();
    const mockLogger2 = vi.fn();

    const logger1 = await createLabeledLogger(mockLogger1, ["SAML"]);
    const logger2 = await createLabeledLogger(mockLogger2, ["SAML"]);

    logger1("test");
    logger2("test");

    // Same label should produce same style
    expect(mockLogger1.mock.calls[0]![1]).toBe(mockLogger2.mock.calls[0]![1]);
  });

  it("generates different colors for different labels", async () => {
    const mockLogger1 = vi.fn();
    const mockLogger2 = vi.fn();

    const logger1 = await createLabeledLogger(mockLogger1, ["HTTP"]);
    const logger2 = await createLabeledLogger(mockLogger2, ["SAML"]);

    logger1("test");
    logger2("test");

    // Different labels should produce different styles (with high probability)
    expect(mockLogger1.mock.calls[0]![1]).not.toBe(mockLogger2.mock.calls[0]![1]);
  });
});
