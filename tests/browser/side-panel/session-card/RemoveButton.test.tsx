/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { RemoveButton } from "@/side-panel/session-card/RemoveButton.tsx";

import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState } from "react";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries } from "@/tests/browser/lib/testSessionSummaries.ts";

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

let testSessions: SessionSummary[] | Error;

const TestRemoveButton = ({
  disabled,
  id,
  testId,
}: {
  disabled: boolean;
  id: string;
  testId?: string;
}) => {
  const tabId: number = 1234;
  // const testId = "remove-button";
  const [_sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);
  return (
    <RemoveButton
      tabId={tabId}
      sx={{ paddingTop: 0, paddingBottom: 0, marginLeft: 0 }}
      size="medium"
      disabled={disabled}
      id={id}
      setSessionSummaries={setSessionSummaries}
      testId={testId}
    />
  );
};

const renderRemoveButton = async ({
  disabled,
  id,
  sessions,
}: {
  disabled: boolean;
  id: string;
  sessions?: SessionSummary[] | Error;
}) => {
  const testId = "remove-button";
  testSessions = sessions ? sessions : testSessionSummaries.slice(0, 1);
  render(<TestRemoveButton disabled={disabled} id={id} testId={testId} />);
  // screen.debug();
  return {
    removeButton: (await screen.findByTestId(testId)) as HTMLButtonElement,
  };
};

describe("RemoveButton", () => {
  test("Render: disabled=false", async () => {
    const { removeButton } = await renderRemoveButton({
      disabled: false,
      id: "5678",
    });
    // assert
    expect(removeButton.name).toBe("remove");
    expect(removeButton.disabled).toBeFalsy();
  });

  test("Render: disabled=true", async () => {
    const { removeButton } = await renderRemoveButton({
      disabled: true,
      id: "9012",
    });
    // assert
    expect(removeButton.name).toBe("remove");
    expect(removeButton.disabled).toBeTruthy();
  });

  test("Click: OK", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { removeButton } = await renderRemoveButton({
      disabled: false,
      id: "3456",
    });
    // assert
    await user.click(removeButton);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Remove session:"),
      expect.any(String),
    );
  });

  test("Click: Error", async () => {
    const consoleErrorMock = vi.spyOn(console, "error");
    const user = userEvent.setup();
    const { removeButton } = await renderRemoveButton({
      disabled: false,
      id: "7890",
      sessions: new Error(),
    });
    // assert
    await user.click(removeButton);
    expect(consoleErrorMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Failed to getSessionSummaries:"),
      expect.any(Error),
    );
  });
});
