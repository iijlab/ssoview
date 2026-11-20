/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import { Box, type SxProps } from "@mui/material";
// side-panel
import { SessionCard } from "@/side-panel/session-card/SessionCard.tsx";
import { sessionSummaryToCardProps } from "@/side-panel/session-card/props.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";

interface SessionCardListProps {
  tabId: number;
  sessionSummaries: SessionSummary[];
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  imported?: boolean;
  sx?: SxProps;
  testId?: string;
}

const SessionCardList = ({
  tabId,
  sessionSummaries,
  setSessionSummaries,
  imported,
  sx,
  testId,
}: SessionCardListProps) => {
  // Avoid tsc errors: TS2769: No overload matches this call.
  const sxProps = { ...sx } as const;

  return (
    <Box
      sx={[
        sxProps,
        {
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginLeft: "8px",
          marginRight: "8px",
          // marginTop: "12px",
        },
      ]}
    >
      {sessionSummaries.map((s: SessionSummary) => {
        if (imported !== undefined && imported !== s.imported) {
          return;
        }
        const p = sessionSummaryToCardProps(s);
        p.tabId = tabId;
        p.setSessionSummaries = setSessionSummaries;
        return <SessionCard key={p.id} {...p} testId={testId} />;
      })}
    </Box>
  );
};

export { SessionCardList };
