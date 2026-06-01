/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { StopButton } from "@/side-panel/record-panel/StopButton.tsx";

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/rpc.ts", () => ({
  stopMonitoring: vi.fn(async (_tabId: string): Promise<void | Error> => {
    if (errStopMonitoring instanceof Error) {
      return Promise.resolve(errStopMonitoring);
    } else {
      return Promise.resolve();
    }
  }),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    if (errGetSessionSummaries instanceof Error) {
      return Promise.resolve(errGetSessionSummaries);
    } else {
      return Promise.resolve([]);
    }
  }),
}));

beforeEach(() => {
  errGetSessionSummaries = undefined;
  errStopMonitoring = undefined;
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

let errGetSessionSummaries: undefined | Error;
let errStopMonitoring: undefined | Error;

const TestStopButton = () => {
  const tabId: number = 1234;
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.RECORDING);
  const [_sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  return (
    <StopButton
      tabId={tabId}
      panelState={panelState}
      setPanelState={setPanelState}
      setSessionSummaries={setSessionSummaries}
    />
  );
};

const renderStopButton = async () => {
  render(<TestStopButton />);
  // screen.debug();
  return {
    stopButton: (await screen.findByRole("button", { name: "STOP" })) as HTMLButtonElement,
  };
};

describe("StopButton", () => {
  test("Render", async () => {
    const { stopButton } = await renderStopButton();
    // assert
    expect(stopButton.innerText).toBe("STOP");
    expect(stopButton.disabled).toBeFalsy();
  });

  test("Click STOP: success", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { stopButton } = await renderStopButton();
    await user.click(stopButton);
    // assert
    expect(stopButton.disabled).toBeTruthy();
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Click the Stop button/),
    );
  });

  test("Click STOP: failure: stopMonitoring", async () => {
    errStopMonitoring = new Error("TEST: stopMonitoring failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { stopButton } = await renderStopButton();
    await user.click(stopButton);
    // assert
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to stop monitoring:/),
      expect.objectContaining(errStopMonitoring),
    );
  });

  test("Click STOP: failure: getSessionSummaries", async () => {
    errGetSessionSummaries = new Error("TEST: getSessionSummaries failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { stopButton } = await renderStopButton();
    await user.click(stopButton);
    // assert
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to getSessionSummaries:/),
      expect.objectContaining(errGetSessionSummaries),
    );
  });
});
