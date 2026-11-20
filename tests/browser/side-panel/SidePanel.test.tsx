/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SidePanel } from "@/side-panel/SidePanel.tsx";

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import {
  type CaptureTerminatedReason,
  subscribeCaptureTerminatedEvent,
  subscribeSessionUpdateEvent,
} from "@/common/pubsub.ts";

type SessionUpdateHandler = (tabId: number, sessionId: string) => Promise<void>;
type CaptureTerminatedHandler = (tabId: number, reason: CaptureTerminatedReason) => Promise<void>;

// The mocks keep the handlers, so that a test can publish an event by calling them.
vi.mock("@/common/pubsub.ts", () => ({
  subscribeCaptureTerminatedEvent: vi.fn((handler: CaptureTerminatedHandler): void | Error => {
    if (errSubscribeCaptureTerminatedEvent instanceof Error) {
      return errSubscribeCaptureTerminatedEvent;
    }
    captureTerminatedHandlers.push(handler);
  }),
  subscribeSessionUpdateEvent: vi.fn((handler: SessionUpdateHandler): void | Error => {
    if (errSubscribeSessionUpdateEvent instanceof Error) {
      return errSubscribeSessionUpdateEvent;
    }
    sessionUpdateHandlers.push(handler);
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  testSessions = testSessionSummaries.slice(0, 1);
  errSubscribeCaptureTerminatedEvent = undefined;
  errSubscribeSessionUpdateEvent = undefined;
  captureTerminatedHandlers = [];
  sessionUpdateHandlers = [];
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const tabId: number = 1234;
const testId = "session-card";
let testSessions: SessionSummary[] | Error = [];
let errSubscribeCaptureTerminatedEvent: undefined | Error;
let errSubscribeSessionUpdateEvent: undefined | Error;
let captureTerminatedHandlers: CaptureTerminatedHandler[] = [];
let sessionUpdateHandlers: SessionUpdateHandler[] = [];

const findRecButton = async () =>
  (await screen.findByRole("button", { name: "REC" })) as HTMLButtonElement;

describe("SidePanel", () => {
  test("Render: RecordPanel", async () => {
    render(<SidePanel tabId={tabId} />);
    // screen.debug();
    const recButton = await findRecButton();
    expect(recButton.innerText).toBe("REC");
    const stopButton = (await screen.findByRole("button", { name: "STOP" })) as HTMLButtonElement;
    expect(stopButton.innerText).toBe("STOP");
  });

  test("Render: RecordPanel: SessionCardList", async () => {
    render(<SidePanel tabId={tabId} testId={testId} />);
    // screen.debug();
    const sessionCardList = (await screen.findAllByTestId(testId)) as HTMLDivElement[];
    expect(sessionCardList).toHaveLength(1);
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

  test("Render: failure: getSessionSummaries", async () => {
    testSessions = new Error("TEST: getSessionSummaries failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    render(<SidePanel tabId={tabId} />);
    await waitFor(() =>
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to getSessionSummaries:/),
        testSessions,
      ),
    );
  });
});

describe("SidePanel: PubSub", () => {
  test("Subscribe to each event once", async () => {
    render(<SidePanel tabId={tabId} />);
    await findRecButton();
    expect(subscribeSessionUpdateEvent).toHaveBeenCalledTimes(1);
    expect(subscribeCaptureTerminatedEvent).toHaveBeenCalledTimes(1);
  });

  // Showing a hidden tab again runs the effects of its components again.
  // The subscriptions cannot be removed, so they must not be added there.
  test("Switch tabs: do not subscribe again", async () => {
    render(<SidePanel tabId={tabId} />);
    const recordTab = (await screen.findByRole("tab", { name: "Record" })) as HTMLButtonElement;
    const savedTab = (await screen.findByRole("tab", { name: "Saved" })) as HTMLButtonElement;
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) {
      await user.click(savedTab);
      await screen.findByLabelText("load");
      await user.click(recordTab);
      await findRecButton();
    }
    expect(subscribeSessionUpdateEvent).toHaveBeenCalledTimes(1);
    expect(subscribeCaptureTerminatedEvent).toHaveBeenCalledTimes(1);
  });

  test("SessionUpdateEvent: update SessionCardList", async () => {
    render(<SidePanel tabId={tabId} testId={testId} />);
    expect(await screen.findAllByTestId(testId)).toHaveLength(1);
    expect(sessionUpdateHandlers).toHaveLength(1);

    testSessions = testSessionSummaries.slice(0, 2);
    await sessionUpdateHandlers[0]?.(tabId, "test-subscribeSessionUpdateEvent");
    await waitFor(() => expect(screen.getAllByTestId(testId)).toHaveLength(2));
  });

  test("SessionUpdateEvent: failure: getSessionSummaries", async () => {
    const consoleErrorMock = vi.spyOn(console, "error");
    render(<SidePanel tabId={tabId} testId={testId} />);
    expect(await screen.findAllByTestId(testId)).toHaveLength(1);

    testSessions = new Error("TEST: getSessionSummaries failed");
    await sessionUpdateHandlers[0]?.(tabId, "test-subscribeSessionUpdateEvent");
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to getSessionSummaries:/),
      testSessions,
    );
    // The list is left as it was
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });

  test("CaptureTerminatedEvent: stop recording", async () => {
    render(<SidePanel tabId={tabId} testId={testId} />);
    const recButton = await findRecButton();
    const user = userEvent.setup();
    await user.click(recButton);
    await waitFor(() => expect(recButton.disabled).toBeTruthy());
    expect(captureTerminatedHandlers).toHaveLength(1);

    testSessions = testSessionSummaries.slice(0, 2);
    await captureTerminatedHandlers[0]?.(tabId, "target_closed");
    await waitFor(() => expect(recButton.disabled).toBeFalsy());
    await waitFor(() => expect(screen.getAllByTestId(testId)).toHaveLength(2));
  });

  test("CaptureTerminatedEvent: tabId mismatched", async () => {
    const consoleWarnMock = vi.spyOn(console, "warn");
    render(<SidePanel tabId={tabId} testId={testId} />);
    const recButton = await findRecButton();
    const user = userEvent.setup();
    await user.click(recButton);
    await waitFor(() => expect(recButton.disabled).toBeTruthy());

    testSessions = testSessionSummaries.slice(0, 2);
    await captureTerminatedHandlers[0]?.(3456, "target_closed");
    expect(consoleWarnMock).toHaveBeenCalledWith(expect.stringContaining("tabId mismatched:"));
    // Recording stops, but the list is left as it was
    await waitFor(() => expect(recButton.disabled).toBeFalsy());
    expect(screen.getAllByTestId(testId)).toHaveLength(1);
  });

  test("Render: failure: subscribeSessionUpdateEvent", async () => {
    errSubscribeSessionUpdateEvent = new Error("TEST: subscribeSessionUpdateEvent failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    render(<SidePanel tabId={tabId} />);
    await waitFor(() =>
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/subscribeSessionUpdateEvent failed:/),
        errSubscribeSessionUpdateEvent,
      ),
    );
  });

  test("Render: failure: subscribeCaptureTerminatedEvent", async () => {
    errSubscribeCaptureTerminatedEvent = new Error("TEST: subscribeCaptureTerminatedEvent failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    render(<SidePanel tabId={tabId} />);
    await waitFor(() =>
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/subscribeCaptureTerminatedEvent failed:/),
        errSubscribeCaptureTerminatedEvent,
      ),
    );
  });
});
