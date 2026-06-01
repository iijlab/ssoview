/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SessionPanel } from "@/side-panel/session-panel/SessionPanel.tsx";

import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/pubsub.ts", () => ({
  subscribeSessionUpdateEvent: vi.fn(),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    return Promise.resolve(testSessions);
  }),
  deleteSession: vi.fn(),
}));

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const testSessions = testSessionSummaries.slice(5, 7);

const TestSessionPanel = ({
  tabId,
  testId,
  state,
}: {
  tabId: number;
  testId?: string;
  state: SidePanelState;
}) => {
  const [panelState, setPanelState] = useState<SidePanelState>(state);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  const [headerHeight, _setHeaderHeight] = useState(42);
  return (
    <SessionPanel
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

describe("SessionPanel", () => {
  test("Render: SessionPanel: Stopped", async () => {
    render(<TestSessionPanel tabId={1234} /* testId={testId} */ state={SidePanelState.STOPPED} />);
    // screen.debug();
    const loadButton = (await screen.findByLabelText("load")) as HTMLButtonElement;
    expect(loadButton.innerText).toBe("LOAD");
  });

  test("Render: SessionPanel: Recording", () => {
    render(
      <TestSessionPanel tabId={1234} /* testId={testId} */ state={SidePanelState.RECORDING} />,
    );
    // screen.debug();
    const loadButton = screen.queryByLabelText("load") as HTMLButtonElement;
    expect(loadButton.disabled).toBeTruthy();
  });

  test("Render: SessionCardList", async () => {
    const testId = "session-card";
    render(<TestSessionPanel tabId={1234} testId={testId} state={SidePanelState.STOPPED} />);
    // screen.debug();
    const sessionCardList = (await screen.findAllByTestId(testId)) as HTMLDivElement[];
    expect(sessionCardList).toHaveLength(testSessions.filter((s) => s.imported).length);
  });
});
