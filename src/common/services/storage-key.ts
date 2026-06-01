/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

const KEY_SEPARATOR = "__";

export function makeStorageKey(namespace: string, segments: string[]): string {
  return [namespace, ...segments].join(KEY_SEPARATOR);
}

export function makeStorageKeyPrefix(namespace: string, segments: string[]): string {
  return makeStorageKey(namespace, segments) + KEY_SEPARATOR;
}
