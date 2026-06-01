/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { RecordButton } from "@/side-panel/record-panel/RecordButton.tsx";

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";

import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/rpc.ts", () => ({
  startMonitoring: vi.fn(async (_tabId: string): Promise<void | Error> => {
    if (errStartMonitoring instanceof Error) {
      return Promise.resolve(errStartMonitoring);
    } else {
      return Promise.resolve();
    }
  }),
}));

beforeEach(() => {
  errStartMonitoring = undefined;
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

let errStartMonitoring: undefined | Error;

const TestRecordButton = () => {
  const tabId: number = 1234;
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  return <RecordButton tabId={tabId} panelState={panelState} setPanelState={setPanelState} />;
};

const renderRecordButton = async () => {
  render(<TestRecordButton />);
  // screen.debug();
  return {
    recButton: (await screen.findByRole("button", { name: "REC" })) as HTMLButtonElement,
  };
};

describe("RecordButton", () => {
  test("Render", async () => {
    const { recButton } = await renderRecordButton();
    // assert
    expect(recButton.innerText).toBe("REC");
    expect(recButton.disabled).toBeFalsy();
  });

  test("Click REC: success", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { recButton } = await renderRecordButton();
    await user.click(recButton);
    // assert
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Click the Record button/),
    );
  });

  test("Click REC: failure", async () => {
    errStartMonitoring = new Error("TEST: startMonitoring failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { recButton } = await renderRecordButton();
    await user.click(recButton);
    // assert
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to start monitoring:/),
      expect.objectContaining(errStartMonitoring),
    );
  });
});
