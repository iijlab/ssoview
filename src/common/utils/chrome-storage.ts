/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export async function setSessionStorageItem(key: string, value: unknown): Promise<void | Error> {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch (err) {
    return new Error("Failed to set item to session storage", { cause: err });
  }
}

export async function getSessionStorageItems(
  keys: string[],
): Promise<Record<string, unknown> | Error> {
  try {
    const items = await chrome.storage.session.get(keys);
    return items;
  } catch (err) {
    return new Error("Failed to get items from session storage", { cause: err });
  }
}

export async function getAllSessionStorageItems(): Promise<Record<string, unknown> | Error> {
  try {
    return await chrome.storage.session.get(null);
  } catch (err) {
    return new Error("Failed to get all items from session storage", { cause: err });
  }
}

export async function removeSessionStorageItems(keys: string[]): Promise<void | Error> {
  try {
    await chrome.storage.session.remove(keys);
  } catch (err) {
    return new Error("Failed to remove items from session storage", { cause: err });
  }
}

export async function getAllSessionStorageKeys(): Promise<string[] | Error> {
  try {
    return await chrome.storage.session.getKeys();
  } catch (err) {
    return new Error("Failed to get all keys from session storage", { cause: err });
  }
}

export async function getSessionStorageBytesInUse(key: string | null): Promise<number | Error> {
  try {
    return await chrome.storage.session.getBytesInUse(key);
  } catch (err) {
    return new Error("Failed to get bytes in use from session storage", { cause: err });
  }
}
