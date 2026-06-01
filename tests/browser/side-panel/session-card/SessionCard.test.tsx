/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { SessionCard } from "@/side-panel/session-card/SessionCard.tsx";

import userEvent from "@testing-library/user-event/dist/cjs/index.js";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { chrome } from "@/tests/browser/lib/vitest-chrome.ts";
import { testSessionSummaries as sessions } from "@/tests/browser/lib/testSessionSummaries.ts";

import type { SessionSummary } from "@/common/models/session-summary.ts";
import {
  type SessionCardStyles,
  sessionSummaryToCardProps,
} from "@/side-panel/session-card/props.ts";

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
    return Promise.resolve([]);
  }),
}));

// @ts-expect-error "Ignore mismatches with mock types"
window.chrome = chrome;

const TestSessionCard = ({ s, testId }: { s: SessionSummary; testId: string }) => {
  const p = sessionSummaryToCardProps(s);
  p.tabId = 1234;
  return <SessionCard {...p} testId={testId} />;
};

const renderSessionCard = async ({ session }: { session: SessionSummary }) => {
  const testId = "session-card";
  render(<TestSessionCard s={session} testId={testId} />);
  // screen.debug();
  return {
    sessionCard: (await screen.findAllByTestId(testId)) as HTMLDivElement[],
    saveButton: (await screen.findByTestId("save-button")) as HTMLButtonElement,
    removeButton: (await screen.findByTestId("remove-button")) as HTMLButtonElement,
    saveButtonBoundary: (await screen.findByTestId("save-button-boundary")) as HTMLButtonElement,
    removeButtonBoundary: (await screen.findByTestId(
      "remove-button-boundary",
    )) as HTMLButtonElement,
  };
};

describe("sessionSummaryToCardProps", () => {
  test("sessions: (captured, true, in_progress)", async () => {
    const sx = sessionSummaryToCardProps(sessions[0]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("warning.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("4px");
  });
  test("sessions: (captured, true, succeeded)", async () => {
    const sx = sessionSummaryToCardProps(sessions[1]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("primary.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("4px");
  });
  test("sessions: (captured, true, failed)", async () => {
    const sx = sessionSummaryToCardProps(sessions[2]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("error.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("4px");
  });

  test("sessions: (captured, false, in_succeeded)", async () => {
    const sx = sessionSummaryToCardProps(sessions[3]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("warning.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("2px");
  });
  test("sessions: (captured, false, succeeded)", async () => {
    const sx = sessionSummaryToCardProps(sessions[4]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("primary.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("2px");
  });
  test("sessions: (captured, false, failed)", async () => {
    const sx = sessionSummaryToCardProps(sessions[5]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("error.main");
    expect(sx.borderStyle).toBe("solid");
    expect(sx.borderWidth).toBe("2px");
  });

  test("sessions: (imported, false, in_succeeded)", async () => {
    const sx = sessionSummaryToCardProps(sessions[6]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("warning.main");
    expect(sx.borderStyle).toBe("dashed");
    expect(sx.borderWidth).toBe("2px");
  });
  test("sessions: (imported, false, succeeded)", async () => {
    const sx = sessionSummaryToCardProps(sessions[7]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("primary.main");
    expect(sx.borderStyle).toBe("dashed");
    expect(sx.borderWidth).toBe("2px");
  });
  test("sessions: (imported, false, failed)", async () => {
    const sx = sessionSummaryToCardProps(sessions[8]!).sx as SessionCardStyles;
    expect(sx.borderColor).toBe("error.main");
    expect(sx.borderStyle).toBe("dashed");
    expect(sx.borderWidth).toBe("2px");
  });
});

describe("SessionCard", () => {
  test("Render", async () => {
    const { sessionCard } = await renderSessionCard({ session: sessions[0]! });
    expect(sessionCard).toHaveLength(1);
  });

  test("Render Button: SAVE", async () => {
    const { saveButton } = await renderSessionCard({ session: sessions[0]! });
    // assert
    expect(saveButton.name).toBe("save");
  });

  test("Render Button: REMOVE: disable", async () => {
    const { removeButton } = await renderSessionCard({ session: sessions[0]! });
    // assert
    expect(removeButton.name).toBe("remove");
    expect(removeButton.disabled).toBeTruthy();
  });

  test("Render Button: REMOVE: enable", async () => {
    const { removeButton } = await renderSessionCard({ session: sessions[3]! });
    // assert
    expect(removeButton.name).toBe("remove");
    expect(removeButton.disabled).toBeFalsy();
  });

  test("Click", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { sessionCard } = await renderSessionCard({ session: sessions[1]! });
    // assert
    await user.click(sessionCard[0] as HTMLDivElement);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringContaining("create extension tab:"),
      expect.any(Number),
    );
  });

  test("Click Button: SAVE", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { saveButton } = await renderSessionCard({ session: sessions[1]! });
    // assert
    await user.click(saveButton);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Click the Save button"),
    );
  });

  test("Click Button: REMOVE", async () => {
    const consoleInfoMock = vi.spyOn(console, "info");
    const user = userEvent.setup();
    const { removeButton } = await renderSessionCard({ session: sessions[3]! });
    // assert
    await user.click(removeButton);
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Remove session:"),
      expect.any(String),
    );
  });

  test("Click: SAVE button boundary", async () => {
    const consoleDebugMock = vi.spyOn(console, "debug");
    const user = userEvent.setup();
    const { saveButtonBoundary } = await renderSessionCard({ session: sessions[1]! });
    // assert
    await user.click(saveButtonBoundary);
    expect(consoleDebugMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Stop propagating click events to SessionCard"),
    );
  });

  test("Click: REMOVE button boundary", async () => {
    const consoleDebugMock = vi.spyOn(console, "debug");
    const user = userEvent.setup();
    const { removeButtonBoundary } = await renderSessionCard({ session: sessions[3]! });
    // assert
    await user.click(removeButtonBoundary);
    expect(consoleDebugMock).toHaveBeenLastCalledWith(
      expect.stringContaining("Stop propagating click events to SessionCard"),
    );
  });
});
