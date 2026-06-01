/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SaveButton } from "@/side-panel/session-card/SaveButton.tsx";

import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";

vi.mock("@/common/services/session-archiver.ts", () => ({
  dumpSessionArchive: vi.fn(async (): Promise<string | Error> => {
    return Promise.resolve('{"sessionId": "test-dumpSessionArchive"}');
  }),
}));

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const renderSaveButton = async (id: string) => {
  const tabId: number = 1234;
  const testId = "save-button";
  render(
    <SaveButton
      tabId={tabId}
      sx={{ paddingTop: 0, paddingBottom: 0, marginLeft: "0.2em", marginRight: "0.2em" }}
      size="medium"
      id={id}
      testId={testId}
    />,
  );
  // screen.debug();
  return {
    saveButton: (await screen.findByTestId(testId)) as HTMLButtonElement,
  };
};

describe("SaveButton", () => {
  test("Render", async () => {
    const { saveButton } = await renderSaveButton("5678");
    // assert
    expect(saveButton.name).toBe("save");
  });

  test("Click", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { saveButton } = await renderSaveButton("9012");
    // assert
    await user.click(saveButton);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Click the Save button"),
    );
  });
});
