/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import { getHttpStatusText } from "./utils.ts";

describe("getHttpStatusText", () => {
  it("returns OK for 200", () => {
    expect(getHttpStatusText(200)).toBe("OK");
  });

  it("returns Created for 201", () => {
    expect(getHttpStatusText(201)).toBe("Created");
  });

  it("returns No Content for 204", () => {
    expect(getHttpStatusText(204)).toBe("No Content");
  });

  it("returns Moved Permanently for 301", () => {
    expect(getHttpStatusText(301)).toBe("Moved Permanently");
  });

  it("returns Found for 302", () => {
    expect(getHttpStatusText(302)).toBe("Found");
  });

  it("returns See Other for 303", () => {
    expect(getHttpStatusText(303)).toBe("See Other");
  });

  it("returns Not Modified for 304", () => {
    expect(getHttpStatusText(304)).toBe("Not Modified");
  });

  it("returns Temporary Redirect for 307", () => {
    expect(getHttpStatusText(307)).toBe("Temporary Redirect");
  });

  it("returns Permanent Redirect for 308", () => {
    expect(getHttpStatusText(308)).toBe("Permanent Redirect");
  });

  it("returns Bad Request for 400", () => {
    expect(getHttpStatusText(400)).toBe("Bad Request");
  });

  it("returns Unauthorized for 401", () => {
    expect(getHttpStatusText(401)).toBe("Unauthorized");
  });

  it("returns Forbidden for 403", () => {
    expect(getHttpStatusText(403)).toBe("Forbidden");
  });

  it("returns Not Found for 404", () => {
    expect(getHttpStatusText(404)).toBe("Not Found");
  });

  it("returns Method Not Allowed for 405", () => {
    expect(getHttpStatusText(405)).toBe("Method Not Allowed");
  });

  it("returns Conflict for 409", () => {
    expect(getHttpStatusText(409)).toBe("Conflict");
  });

  it("returns Unprocessable Entity for 422", () => {
    expect(getHttpStatusText(422)).toBe("Unprocessable Entity");
  });

  it("returns Too Many Requests for 429", () => {
    expect(getHttpStatusText(429)).toBe("Too Many Requests");
  });

  it("returns Internal Server Error for 500", () => {
    expect(getHttpStatusText(500)).toBe("Internal Server Error");
  });

  it("returns Bad Gateway for 502", () => {
    expect(getHttpStatusText(502)).toBe("Bad Gateway");
  });

  it("returns Service Unavailable for 503", () => {
    expect(getHttpStatusText(503)).toBe("Service Unavailable");
  });

  it("returns Gateway Timeout for 504", () => {
    expect(getHttpStatusText(504)).toBe("Gateway Timeout");
  });

  it("returns empty string for unknown status code", () => {
    expect(getHttpStatusText(999)).toBe("");
  });

  it("returns empty string for 0", () => {
    expect(getHttpStatusText(0)).toBe("");
  });
});
