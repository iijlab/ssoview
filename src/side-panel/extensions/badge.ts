/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

const hideBadge = () => {
  chrome.action.setBadgeText({ text: "" }, () => {});
};

const showBadge = (text: string, textColor: string, backgroundColor: string) => {
  chrome.action.setBadgeBackgroundColor({ color: backgroundColor }, () => {});
  chrome.action.setBadgeTextColor({ color: textColor }, () => {});
  chrome.action.setBadgeText({ text: text }, () => {});
};

export { hideBadge, showBadge };
