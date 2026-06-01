/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Roboto font: MUI's default
import "@fontsource/roboto/latin-300.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
// side-panel
import { SidePanel } from "@/side-panel/SidePanel.tsx";
import { ErrorPage } from "@/side-panel/ErrorPage.tsx";
// local
import { getActiveTabId } from "@/common/utils/chrome-tabs.ts";

(async () => {
  const rootElm = document.getElementById("root") as HTMLElement;

  const tabId = await getActiveTabId();
  if (tabId instanceof Error) {
    console.error("Failed to get active tabId:", tabId);
    // Render Error page
    createRoot(rootElm).render(
      <StrictMode>
        <ErrorPage msg={`Failed to get active tabId: ${tabId}`} />
      </StrictMode>,
    );
    return;
  }

  // Render React components
  createRoot(rootElm).render(
    <StrictMode>
      <SidePanel tabId={tabId} />
    </StrictMode>,
  );

  return;
})();
