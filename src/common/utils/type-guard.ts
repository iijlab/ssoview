/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export const isObject = (u: unknown): u is Record<string, unknown> =>
  u != null && typeof u === "object";
