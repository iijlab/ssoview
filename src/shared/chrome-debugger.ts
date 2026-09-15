/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export async function isAttached(tabId: number): Promise<boolean | Error> {
  try {
    const targets = await chrome.debugger.getTargets();
    return !!targets.find((t) => t.tabId === tabId)?.attached;
  } catch (err) {
    return new Error("Failed to get debugger targets", { cause: err });
  }
}
