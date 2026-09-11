/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { exportSsoFlow, importHttpArchive } from "@/common/services/session-archiver.ts";
import { deleteSsoFlow, getSsoFlows } from "@/common/services/session-manager.ts";
import { registerDevCommands } from "./dev-commands.ts";

vi.mock("@/common/services/session-archiver.ts", () => ({
  exportSsoFlow: vi.fn(),
  importHttpArchive: vi.fn(),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  deleteSsoFlow: vi.fn(),
  getSsoFlows: vi.fn(),
}));

function getCmd(): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).cmd;
}

describe("registerDevCommands", () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).cmd;
  });

  it("should expose commands named after the functions they call", () => {
    registerDevCommands();

    expect(Object.keys(getCmd()).sort()).toEqual(
      ["dumpStorage", "deleteSsoFlow", "exportSsoFlow", "getSsoFlows", "importHttpArchive"].sort(),
    );
    expect(getCmd().getSsoFlows).toBe(getSsoFlows);
    expect(getCmd().deleteSsoFlow).toBe(deleteSsoFlow);
    expect(getCmd().exportSsoFlow).toBe(exportSsoFlow);
    expect(getCmd().importHttpArchive).toBe(importHttpArchive);
    expect(getCmd().dumpStorage).toBeTypeOf("function");
  });
});
