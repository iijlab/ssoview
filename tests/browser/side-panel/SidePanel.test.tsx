/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SidePanel } from "@/side-panel/SidePanel.tsx";

import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";

vi.mock("@/common/pubsub.ts", () => ({
  subscribeCaptureTerminatedEvent: vi.fn(),
  subscribeSessionRemoveEvent: vi.fn(),
  subscribeSessionUpdateEvent: vi.fn(),
}));

vi.mock("@/common/rpc.ts", () => ({
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
}));

vi.mock("@/common/services/session-archiver.ts", () => ({
  dumpSessionArchive: vi.fn(async (): Promise<string | Error> => {
    return Promise.resolve('{"sessionId": "test-dumpSessionArchive"}');
  }),
  loadSessionArchive: vi.fn(async (_tabId: number, _har: string): Promise<string[] | Error> => {
    return Promise.resolve([
      "test-loadSessionArchive-00",
      "test-loadSessionArchive-01",
      "test-loadSessionArchive-02",
    ]);
  }),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  deleteSession: vi.fn(async (): Promise<void | Error> => {
    return Promise.resolve();
  }),
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    return Promise.resolve(testSessions);
  }),
}));

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const tabId: number = 1234;
const testSessions = testSessionSummaries.slice(0, 1);

describe("SidePanel", () => {
  test("Render: RecordPanel", async () => {
    render(<SidePanel tabId={tabId} />);
    // screen.debug();
    const recButton = (await screen.findByRole("button", { name: "REC" })) as HTMLButtonElement;
    expect(recButton.innerText).toBe("REC");
    const stopButton = (await screen.findByRole("button", { name: "STOP" })) as HTMLButtonElement;
    expect(stopButton.innerText).toBe("STOP");
  });

  test("Render: RecordPanel: SessionCardList", async () => {
    const testId = "session-card";
    render(<SidePanel tabId={tabId} testId={testId} />);
    // screen.debug();
    const sessionCardList = (await screen.findAllByTestId(testId)) as HTMLDivElement[];
    expect(sessionCardList).toHaveLength(testSessions.length);
  });

  test("Render: SessionPanel", async () => {
    render(<SidePanel tabId={tabId} />);
    // screen.debug();
    const savedButton = (await screen.findByRole("tab", { name: "Saved" })) as HTMLButtonElement;
    // switch to session-panel
    const user = userEvent.setup();
    await user.click(savedButton);
    // check the load button
    const loadButton = (await screen.findByLabelText("load")) as HTMLButtonElement;
    expect(loadButton.innerText).toBe("LOAD");
  });
});
