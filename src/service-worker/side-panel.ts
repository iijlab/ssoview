/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// @ts-expect-error "Avoid errors caused by erasableSyntaxOnly"
import ContextType = chrome.runtime.ContextType;
// local
import { getActiveTabId } from "@/common/utils/chrome-tabs.ts";
import { hideBadge, IconPath } from "@/service-worker/action-icon.ts";

export function registerSidePanelOpenHandler(): void {
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) {
      console.error("tab.id is undefined");
      return;
    }
    const tabId = tab.id;

    chrome.runtime.getContexts({ contextTypes: [ContextType.SIDE_PANEL] }, (contexts) => {
      const isSidePanelOpen = contexts.length > 0;
      console.debug(`[${tabId}]: isSidePanelOpen: ${isSidePanelOpen}`);

      if (isSidePanelOpen) {
        console.info(`[${tabId}]: SidePanel is already open`);
      } else {
        // SidePanel
        chrome.sidePanel.setOptions(
          {
            tabId: tabId,
            path: "side-panel.html",
            enabled: true,
          },
          () => {},
        );
        chrome.sidePanel.open({ tabId: tabId }, () => {});
        console.info(`[${tabId}]: chrome.sidePanel.open`);
        // Icon
        chrome.action.setIcon({ path: IconPath.ACTIVE }, () => {});
        // Badge
        hideBadge(); // Just in case
      }
    });
  });
}

export function registerSidePanelCloseHandler(
  onSidePanelClosed: (tabId: number) => Promise<void>,
): void {
  chrome.sidePanel.onClosed.addListener((info) => {
    (async () => {
      let tabId: number;
      if (info.tabId === undefined) {
        const result = await getActiveTabId();
        if (result instanceof Error) {
          console.error("Failed to get active tabId:", result);
          return;
        }
        tabId = result;
      } else {
        tabId = info.tabId;
      }
      console.info(`[${tabId}]: SidePanel closed`);

      // Icon
      chrome.action.setIcon({ path: IconPath.DEFAULT }, () => {});
      // Badge
      hideBadge();

      await onSidePanelClosed(tabId);
    })();
  });
}
