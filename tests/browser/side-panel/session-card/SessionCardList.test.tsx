/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SessionCardList } from "@/side-panel/session-card/SessionCardList.tsx";

import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

vi.mock("@/common/services/session-archiver.ts", () => ({
  dumpSessionArchive: vi.fn(async (): Promise<string | Error> => {
    return Promise.resolve('{"sessionId": "test-dumpSessionArchive"}');
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

vi.mock("@/common/pubsub.ts", () => ({
  subscribeSessionUpdateEvent: vi.fn(
    (handler: (tabId: number, sessionId: string) => Promise<void>): void | Error => {
      if (errSubscribeSessionUpdateEvent instanceof Error) {
        return errSubscribeSessionUpdateEvent;
      } else {
        (async () => {
          return await handler(1234, "test-subscribeSessionUpdateEvent");
        })();
      }
    },
  ),
}));

beforeEach(() => {
  errSubscribeSessionUpdateEvent = undefined;
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

let testSessions: SessionSummary[] | Error = [];
let errSubscribeSessionUpdateEvent: undefined | Error;

const TestSessionCardList = ({ testId }: { testId: string }) => {
  const tabId: number = 1234;
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  return (
    <SessionCardList
      tabId={tabId}
      sessionSummaries={sessionSummaries}
      setSessionSummaries={setSessionSummaries}
      testId={testId}
    />
  );
};

const renderSessionCardList = async ({ sessions }: { sessions: SessionSummary[] }) => {
  const testId = "session-card";
  testSessions = sessions;
  render(<TestSessionCardList testId={testId} />);
  // screen.debug();
  return {
    sessionCardList: (await screen.findAllByTestId(testId)) as HTMLDivElement[],
  };
};

describe("SessionCardList", () => {
  // If 0 matches, findAllBy...	throws an error.
  // ref. https://testing-library.com/docs/queries/about#types-of-queries
  test("Render: 0 sessions", () => {
    const testId = "session-card";
    testSessions = [];
    render(<TestSessionCardList testId={testId} />);
    const sessionCardList = screen.queryAllByTestId(testId) as HTMLDivElement[]; // Return []
    expect(sessionCardList).toHaveLength(0);
  });

  test("Render: 1 sessions", async () => {
    const ss = testSessionSummaries.slice(0, 1);
    const { sessionCardList } = await renderSessionCardList({ sessions: ss });
    expect(sessionCardList).toHaveLength(ss.length);
  });

  test("Render: 2 sessions", async () => {
    const ss = testSessionSummaries.slice(0, 2);
    const { sessionCardList } = await renderSessionCardList({ sessions: ss });
    expect(sessionCardList).toHaveLength(ss.length);
  });

  test("Render: failure: subscribeSessionUpdateEvent", async () => {
    errSubscribeSessionUpdateEvent = new Error("TEST: subscribeSessionUpdateEvent failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const testId = "session-card";
    render(<TestSessionCardList testId={testId} />);
    // screen.debug();
    await waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/subscribeSessionUpdateEvent failed:/),
        expect.objectContaining(errSubscribeSessionUpdateEvent),
      ),
    );
  });

  test("Render: failure: getSessionSummaries", async () => {
    testSessions = new Error("TEST: getSessionSummaries failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const testId = "session-card";
    render(<TestSessionCardList testId={testId} />);
    // screen.debug();
    await waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to getSessionSummaries:/),
        expect.objectContaining(testSessions),
      ),
    );
  });
});
