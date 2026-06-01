/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/common/models/session-summary.ts";
import type { SamlTrace } from "@/common/models/saml-trace.ts";
import { deleteSession, getSessionSummaries, getSessionSummary } from "./session-manager.ts";

vi.mock("@/common/services/http-store.ts", () => ({
  purgeHttpMessages: vi.fn(),
}));

vi.mock("@/common/services/saml-store.ts", () => ({
  purgeSamlTraces: vi.fn(),
  retrieveSamlTraces: vi.fn(),
}));

vi.mock("@/common/services/saml-summarizer.ts", () => ({
  getSamlSessionSummary: vi.fn(),
}));

vi.mock("@/common/utils/chrome-debugger.ts", () => ({
  isAttached: vi.fn(),
}));

vi.mock("@/common/models/session-summary.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/common/models/session-summary.ts")>();
  return {
    ...original,
    debugSessionSummary: vi.fn(),
  };
});

const { purgeHttpMessages } = await import("@/common/services/http-store.ts");
const { purgeSamlTraces, retrieveSamlTraces } = await import("@/common/services/saml-store.ts");
const { getSamlSessionSummary } = await import("@/common/services/saml-summarizer.ts");
const { isAttached } = await import("@/common/utils/chrome-debugger.ts");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("deleteSession", () => {
  it("deletes SAML and HTTP messages on success", async () => {
    vi.mocked(purgeSamlTraces).mockResolvedValue(undefined);
    vi.mocked(purgeHttpMessages).mockResolvedValue(undefined);

    const result = await deleteSession(1, "session-1");

    expect(result).toBeUndefined();
    expect(purgeSamlTraces).toHaveBeenCalledWith(1, "session-1");
    expect(purgeHttpMessages).toHaveBeenCalledWith(1, "session-1");
  });

  it("returns Error when purgeSamlTraces fails", async () => {
    vi.mocked(purgeSamlTraces).mockResolvedValue(new Error("saml purge error"));

    const result = await deleteSession(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("saml purge error");
    expect(purgeHttpMessages).not.toHaveBeenCalled();
  });

  it("succeeds even when purgeHttpMessages fails", async () => {
    vi.mocked(purgeSamlTraces).mockResolvedValue(undefined);
    vi.mocked(purgeHttpMessages).mockResolvedValue(new Error("http purge error"));
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await deleteSession(1, "session-1");

    expect(result).toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
    warnMock.mockRestore();
  });
});

const baseSummary: Omit<SessionSummary, "capturing"> = {
  protocol: "saml",
  imported: false,
  sessionId: "session-1",
  start: "2026-01-01T00:00:00Z",
  warning: [],
};

describe("getSessionSummary", () => {
  it("returns summary with capturing flag", async () => {
    vi.mocked(getSamlSessionSummary).mockResolvedValue(baseSummary as SessionSummary);
    vi.mocked(retrieveSamlTraces).mockResolvedValue([
      { sessionId: "session-1", createdAt: "2026-01-01T00:00:00Z" },
    ] as SamlTrace[]);
    vi.mocked(isAttached).mockResolvedValue(true);

    const result = await getSessionSummary(1, "session-1");

    expect(result).not.toBeInstanceOf(Error);
    expect((result as SessionSummary).capturing).toBe(true);
  });

  it("returns Error when getSamlSessionSummary fails", async () => {
    vi.mocked(getSamlSessionSummary).mockResolvedValue(new Error("summary error"));

    const result = await getSessionSummary(1, "session-1");

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("summary error");
  });
});

describe("getSessionSummaries", () => {
  it("returns summaries sorted by start time in descending order", async () => {
    const samlTraces = [
      { sessionId: "session-1", createdAt: "2026-01-01T00:00:00Z" },
      { sessionId: "session-2", createdAt: "2026-01-02T00:00:00Z" },
    ] as SamlTrace[];
    vi.mocked(retrieveSamlTraces).mockResolvedValue(samlTraces);
    vi.mocked(getSamlSessionSummary).mockImplementation(async (_tabId, sessionId) => {
      return {
        ...baseSummary,
        sessionId,
        start: sessionId === "session-1" ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z",
      } as SessionSummary;
    });
    vi.mocked(isAttached).mockResolvedValue(false);

    const result = await getSessionSummaries(1);

    expect(result).not.toBeInstanceOf(Error);
    const summaries = result as SessionSummary[];
    expect(summaries).toHaveLength(2);
    expect(summaries[0]!.sessionId).toBe("session-2");
    expect(summaries[1]!.sessionId).toBe("session-1");
  });

  it("returns Error when retrieveSamlTraces fails", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue(new Error("storage error"));

    const result = await getSessionSummaries(1);

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("storage error");
  });

  it("returns empty array when no sessions exist", async () => {
    vi.mocked(retrieveSamlTraces).mockResolvedValue([]);

    const result = await getSessionSummaries(1);

    expect(result).toEqual([]);
  });
});
