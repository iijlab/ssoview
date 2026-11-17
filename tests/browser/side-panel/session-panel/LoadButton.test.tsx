/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { LoadButton } from "@/side-panel/session-panel/LoadButton.tsx";

import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { SidePanelState } from "@/side-panel/config.ts";
import { loadSessionArchive } from "@/common/services/session-archiver.ts";
import { getSessionSummaries } from "@/common/services/session-manager.ts";

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

// user.upload() returns before the async onChange handler finishes,
// so wait until the handler logs the updated sessions at its end.
const waitForSessionUpdated = (consoleDebugMock: MockInstance<typeof console.debug>) =>
  vi.waitFor(() =>
    expect(consoleDebugMock).toHaveBeenCalledWith(
      expect.stringMatching(/Session updated:/),
      expect.anything(),
    ),
  );

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
    const consoleDebugMock = vi.spyOn(console, "debug");
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    const files = [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
      new File(['{"id": 456}'], "test1.har", { type: "application/json" }),
      new File(['{"id": 789}'], "test2.json", { type: "application/json" }),
    ];

    // []
    // An empty selection does not change the input, so no change event fires.
    testSessions = [];
    await user.upload(hideInput, []);
    expect(hideInput.files).toHaveLength(0);

    // [test0.har]
    testSessions = testSessionSummaries.slice(0, 1);
    consoleDebugMock.mockClear();
    consoleInfoMock.mockClear();
    await user.upload(hideInput, files.slice(0, 1));
    await waitForSessionUpdated(consoleDebugMock);
    expect(hideInput.files).toHaveLength(0);
    expect(consoleInfoMock).toHaveBeenCalledWith(
      expect.stringMatching(/Sent "test0.har" to ServiceWorker/),
    );

    // [test0.har, test1.har, test2.json]
    // Files are processed concurrently, so the order of the logs is not fixed.
    testSessions = testSessionSummaries.slice(0, 3);
    consoleDebugMock.mockClear();
    consoleInfoMock.mockClear();
    await user.upload(hideInput, files);
    await waitForSessionUpdated(consoleDebugMock);
    expect(hideInput.files).toHaveLength(0);
    for (const name of ["test0.har", "test1.har", "test2.json"]) {
      expect(consoleInfoMock).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`Sent "${name}" to ServiceWorker`)),
      );
    }
  });

  test("Upload files: failure", async () => {
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    // not_json.har
    const notJsonFile = new File(["not_json"], "not_json.har", { type: "application/json" });
    await user.upload(hideInput, notJsonFile);
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to JSON.parse:/),
        expect.any(SyntaxError),
      ),
    );

    // decode_error.har
    const decodeErrorFile = new File([new Uint8Array([0x80])], "decode_error.har", {
      type: "application/json",
    });
    await user.upload(hideInput, decodeErrorFile);
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to TextDecoder.decode:/),
        expect.any(TypeError),
      ),
    );
  });

  test("Upload files: failure: empty file", async () => {
    const consoleDebugMock = vi.spyOn(console, "debug");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, new File([], "empty.har", { type: "application/json" }));
    // The handler runs to the end instead of waiting for the empty file forever.
    await waitForSessionUpdated(consoleDebugMock);
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to read "empty.har":/),
      expect.objectContaining({ message: expect.stringMatching(/empty/) }),
    );
  });

  test("Upload files: failure: empty file with a valid file", async () => {
    testSessions = testSessionSummaries.slice(0, 1);
    const consoleDebugMock = vi.spyOn(console, "debug");
    const consoleInfoMock = vi.spyOn(console, "info");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File([], "empty.har", { type: "application/json" }),
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    // The valid file is loaded and the sessions are updated.
    await waitForSessionUpdated(consoleDebugMock);
    expect(consoleInfoMock).toHaveBeenCalledWith(
      expect.stringMatching(/Sent "test0.har" to ServiceWorker/),
    );
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to read "empty.har":/),
      expect.objectContaining({ message: expect.stringMatching(/empty/) }),
    );
  });

  test("Upload files: failure: loadSessionArchive", async () => {
    const message = "TEST: loadSessionArchive failed";
    testIds = new Error(message);
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to loadSessionArchive:/),
        expect.objectContaining({ message }),
      ),
    );
  });

  test("Upload files: failure: loadSessionArchive throws", async () => {
    const message = "TEST: loadSessionArchive threw";
    vi.mocked(loadSessionArchive).mockImplementationOnce(async () => {
      throw new Error(message);
    });
    const consoleDebugMock = vi.spyOn(console, "debug");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    // The exception is logged with the file name, and the handler runs to the end.
    await waitForSessionUpdated(consoleDebugMock);
    expect(consoleErrorMock).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to load "test0.har":/),
      expect.objectContaining({ message }),
    );
  });

  test("Upload files: failure: getSessionSummaries", async () => {
    const message = "TEST: getSessionSummaries failed";
    testSessions = new Error(message);
    const consoleInfoMock = vi.spyOn(console, "info");
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    const file = new File(['{"id": 123}'], "test0.har", { type: "application/json" });
    const changeEventCount = () =>
      consoleInfoMock.mock.calls.filter(([msg]) => /Capture a change event/.test(String(msg)))
        .length;

    await user.upload(hideInput, file);
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to getSessionSummaries:/),
        expect.objectContaining({ message }),
      ),
    );
    expect(changeEventCount()).toBe(1);

    // The input is reset even though loading failed, so selecting the same file
    // again fires another change event.
    expect(hideInput.files).toHaveLength(0);
    consoleErrorMock.mockClear();
    await user.upload(hideInput, file);
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to getSessionSummaries:/),
        expect.objectContaining({ message }),
      ),
    );
    expect(changeEventCount()).toBe(2);
  });

  test("Upload files: failure: getSessionSummaries throws", async () => {
    const message = "TEST: getSessionSummaries threw";
    vi.mocked(getSessionSummaries).mockImplementationOnce(async () => {
      throw new Error(message);
    });
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { hideInput } = await renderLoadButton(testId);

    await user.upload(hideInput, [
      new File(['{"id": 123}'], "test0.har", { type: "application/json" }),
    ]);
    // The exception is logged instead of becoming an unhandled rejection.
    await vi.waitFor(() =>
      expect(consoleErrorMock).toHaveBeenLastCalledWith(
        expect.stringMatching(/Failed to getSessionSummaries:/),
        expect.objectContaining({ message }),
      ),
    );
  });
});
