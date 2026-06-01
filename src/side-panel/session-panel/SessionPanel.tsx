/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
// side-panel
import { SessionCardList } from "@/side-panel/session-card/SessionCardList.tsx";
import { LoadButton } from "@/side-panel/session-panel/LoadButton.tsx";
import { SidePanelState } from "@/side-panel/config.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";

interface SessionPanelProps {
  tabId: number;
  panelState: SidePanelState;
  setPanelState: React.Dispatch<React.SetStateAction<SidePanelState>>;
  sessionSummaries: SessionSummary[];
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  headerHeight: number;
  testId?: string;
}

const SessionPanel = ({
  tabId,
  panelState,
  setPanelState,
  sessionSummaries,
  setSessionSummaries,
  headerHeight,
  testId,
}: SessionPanelProps) => {
  const buttonRef = useRef<HTMLElement>(null);
  const [buttonHeight, setButtonHeight] = useState(0);
  useEffect(() => {
    if (buttonRef?.current) {
      const { height } = buttonRef.current.getBoundingClientRect();
      setButtonHeight(height);
    }
  }, [buttonRef]);
  useEffect(() => {
    console.debug(`[${tabId}] buttonHeight:`, buttonHeight);
  }, [tabId, buttonHeight]);

  return (
    <>
      <Box
        ref={buttonRef}
        sx={{
          position: "fixed",
          top: `${headerHeight}px`,
          width: "100%",
          backgroundColor: "background.paper",
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: "10px",
            gridTemplateColumns: "repeat(2, 1fr)",
            marginLeft: "12px",
            marginRight: "12px",
            marginTop: "12px",
            marginBottom: "12px",
          }}
        >
          <Box sx={{ gridRow: 1, gridColumnStart: 1, gridColumnEnd: 2, justifySelf: "center" }}>
            <Box></Box>
          </Box>
          <LoadButton
            tabId={tabId}
            sx={{
              width: "80%",
            }}
            panelState={panelState}
            setPanelState={setPanelState}
            setSessionSummaries={setSessionSummaries}
          />
        </Box>
      </Box>
      <SessionCardList
        tabId={tabId}
        sessionSummaries={sessionSummaries}
        setSessionSummaries={setSessionSummaries}
        imported={true}
        sx={{
          marginTop: `${buttonHeight + 8}px`,
        }}
        testId={testId}
      />
    </>
  );
};

export { SessionPanel };
