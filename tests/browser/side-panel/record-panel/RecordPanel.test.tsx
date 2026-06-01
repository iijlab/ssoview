/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { RecordPanel } from "@/side-panel/record-panel/RecordPanel.tsx";

import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { CaptureTerminatedReason } from "@/common/pubsub.ts";
import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/pubsub.ts", () => ({
  subscribeCaptureTerminatedEvent: vi.fn(
    (handler: (tabId: number, reason: CaptureTerminatedReason) => Promise<void>): void | Error => {
      if (errSubscribeCaptureTerminatedEvent instanceof Error) {
        return errSubscribeCaptureTerminatedEvent;
      } else {
        (async () => {
          await handler(1234, "target_closed");
        })();
      }
    },
  ),
  subscribeSessionUpdateEvent: vi.fn(),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    return Promise.resolve(testSessions);
  }),
  deleteSession: vi.fn(),
}));

beforeEach(() => {
  errSubscribeCaptureTerminatedEvent = undefined;
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const testSessions = testSessionSummaries.slice(0, 1);
let errSubscribeCaptureTerminatedEvent: undefined | Error;

const TestRecordPanel = ({ tabId, testId }: { tabId: number; testId?: string }) => {
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
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

  test("Render: RecordPanel: failure", async () => {
    const consoleWarnMock = vi.spyOn(console, "warn");
    render(<TestRecordPanel tabId={3456} /* testId={testId} */ />);
    // screen.debug();
    expect(consoleWarnMock).toHaveBeenLastCalledWith(expect.stringContaining("tabId mismatched:"));
  });

  test("Render: RecordPanel: failure: subscribeCaptureTerminatedEvent", async () => {
    errSubscribeCaptureTerminatedEvent = new Error("TEST: subscribeCaptureTerminatedEvent failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    render(<TestRecordPanel tabId={1234} /* testId={testId} */ />);
    // screen.debug();
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/subscribeCaptureTerminatedEvent failed:/),
      expect.objectContaining(errSubscribeCaptureTerminatedEvent),
    );
  });

  test("Render: SessionCardList", async () => {
    const testId = "session-card";
    render(<TestRecordPanel tabId={1234} testId={testId} />);
    // screen.debug();
    const sessionCardList = (await screen.findAllByTestId(testId)) as HTMLDivElement[];
    expect(sessionCardList).toHaveLength(testSessions.length);
  });
});
