/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { LoadButton } from "@/side-panel/session-panel/LoadButton.tsx";

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";

vi.mock("@/common/services/session-archiver.ts", () => ({
  loadSessionArchive: vi.fn(async (_tabId: number, _har: string): Promise<string[] | Error> => {
    return Promise.resolve(testIds);
  }),
}));

vi.mock("@/common/services/session-manager.ts", () => ({
  getSessionSummaries: vi.fn(async (): Promise<SessionSummary[] | Error> => {
    return Promise.resolve(testSessions);
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  testIds = [
    "test-loadSessionArchive-00",
    "test-loadSessionArchive-01",
    "test-loadSessionArchive-02",
  ];
  testSessions = [];
});

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

let testIds: string[] | Error = [];
let testSessions: SessionSummary[] | Error = [];

const TestLoadButton = ({ testId }: { testId: string }) => {
  const tabId: number = 1234;
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  const [_sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  return (
    <LoadButton
      tabId={tabId}
      panelState={panelState}
      setPanelState={setPanelState}
      setSessionSummaries={setSessionSummaries}
      testId={testId}
    />
  );
};

const renderLoadButton = async (testId: string) => {
  render(<TestLoadButton testId={testId} />);
  // screen.debug();
  return {
    loadButton: (await screen.findByLabelText("load")) as HTMLButtonElement,
    hideInput: (await screen.findByTestId(testId)) as HTMLInputElement,
  };
};

describe("LoadButton", () => {
  const testId = "load-file";

  test("Render", async () => {
    const { loadButton } = await renderLoadButton(testId);
    // assert
    expect(loadButton.innerText).toBe("LOAD");
    expect(loadButton.disabled).toBeFalsy();
  });

  test("Click LOAD", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { loadButton } = await renderLoadButton(testId);
    await user.click(loadButton);
    // assert
    expect(loadButton.disabled).toBeFalsy();
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Click the Load button/),
    );
  });

  // Test a file picker dialog...
  test("Upload files: success", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    const files = [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
      new File(['{"id": 456}'], "test1.har", { type: "application/json" }),
      new File(['{"id": 789}'], "test2.json", { type: "application/json" }),
    ];

    // []
    testSessions = [];
    await user.upload(hideInput, []);
    expect(hideInput.files).toHaveLength(0);

    // [test0.har]
    testSessions = testSessionSummaries.slice(0, 1);
    await user.upload(hideInput, files.slice(0, 1));
    expect(hideInput.files).toHaveLength(0);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Sent "test0.har" to ServiceWorker/),
    );

    // [test0.har, test1.har, test2.json]
    testSessions = testSessionSummaries.slice(0, 3);
    await user.upload(hideInput, files);
    expect(hideInput.files).toHaveLength(0);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Sent "test2.json" to ServiceWorker/),
    );
  });

  test("Upload files: failure", async () => {
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    // not_json.har
    const notJsonFile = new File(["not_json"], "not_json.har", { type: "application/json" });
    await user.upload(hideInput, notJsonFile);
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to JSON.parse:/),
      expect.objectContaining(/SyntaxError/),
    );

    // decode_error.har
    const decodeErrorFile = new File([new Uint8Array([0x80])], "decode_error.har", {
      type: "application/json",
    });
    await user.upload(hideInput, decodeErrorFile);
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to TextDecoder.decode:/),
      expect.objectContaining(/TypeError/),
    );
  });

  test("Upload files: failure: loadSessionArchive", async () => {
    testIds = new Error("TEST: loadSessionArchive failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to loadSessionArchive:/),
      expect.objectContaining(testIds),
    );
  });

  test("Upload files: failure: getSessionSummaries", async () => {
    testSessions = new Error("TEST: getSessionSummaries failed");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/Failed to getSessionSummaries:/),
      expect.objectContaining(testSessions),
    );
  });
});
