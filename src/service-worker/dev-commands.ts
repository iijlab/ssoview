/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { exportSsoFlow, importHttpArchive } from "@/common/services/session-archiver.ts";
import { deleteSsoFlow, getSsoFlows } from "@/common/services/session-manager.ts";
import {
  getAllSessionStorageItems,
  getSessionStorageBytesInUse,
} from "@/common/utils/chrome-storage.ts";
import { newLabeledDebugLogger } from "@/common/utils/labeled-logger.ts";

export function registerDevCommands(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).cmd = {
    dumpStorage,
    getSsoFlows,
    deleteSsoFlow,
    exportSsoFlow,
    importHttpArchive,
  };
}

async function dumpStorage(): Promise<void> {
  const debug = await newLabeledDebugLogger(["STORAGE"]);

  const allEntries = await getAllSessionStorageItems();
  if (allEntries instanceof Error) {
    console.warn("Failed to get all storage entries:", allEntries);
    return;
  }

  for (const [key, value] of Object.entries(allEntries).sort()) {
    const bytes = await getSessionStorageBytesInUse(key);
    if (bytes instanceof Error) {
      console.warn("Failed to get bytes in use:", bytes);
      continue;
    }
    debug({ [key]: value }, `${bytes.toLocaleString()} bytes`);
  }

  const totalBytes = await getSessionStorageBytesInUse(null);
  if (totalBytes instanceof Error) {
    console.warn("Failed to get total bytes in use:", totalBytes);
    return;
  }
  debug(
    `Storage usage: ${Object.keys(allEntries).length} items (${totalBytes.toLocaleString()} bytes)`,
  );
}
