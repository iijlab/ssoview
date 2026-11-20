/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { RecordPanel } from "@/side-panel/record-panel/RecordPanel.tsx";

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/services/session-manager.ts", () => ({
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    return Promise.resolve(testSessions);
  }),
  deleteSession: vi.fn(),
}));

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const testSessions = testSessionSummaries.slice(0, 1);

const TestRecordPanel = ({ tabId, testId }: { tabId: number; testId?: string }) => {
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  // The panel only shows the sessions it is given. SidePanel loads and updates them.
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>(testSessions);
  const [headerHeight, _setHeaderHeight] = useState(0);
  return (
    <RecordPanel
      tabId={tabId}
      panelState={panelState}
      setPanelState={setPanelState}
      sessionSummaries={sessionSummaries}
      setSessionSummaries={setSessionSummaries}
      headerHeight={headerHeight}
      testId={testId}
    />
  );
};

describe("RecordPanel", () => {
  test("Render: RecordPanel: success", async () => {
    render(<TestRecordPanel tabId={1234} /* testId={testId} */ />);
    // screen.debug();
    const recButton = (await screen.findByRole("button", { name: "REC" })) as HTMLButtonElement;
    expect(recButton.innerText).toBe("REC");
    const stopButton = (await screen.findByRole("button", { name: "STOP" })) as HTMLButtonElement;
    expect(stopButton.innerText).toBe("STOP");
  });

  test("Render: SessionCardList", async () => {
    const testId = "session-card";
    render(<TestRecordPanel tabId={1234} testId={testId} />);
    // screen.debug();
    const sessionCardList = (await screen.findAllByTestId(testId)) as HTMLDivElement[];
    expect(sessionCardList).toHaveLength(testSessions.length);
  });
});
