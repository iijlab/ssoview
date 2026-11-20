/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { grey } from "@mui/material/colors";
// side-panel
import { SessionCardList } from "@/side-panel/session-card/SessionCardList.tsx";
import { RecordButton } from "@/side-panel/record-panel/RecordButton.tsx";
import { StopButton } from "@/side-panel/record-panel/StopButton.tsx";
import { SidePanelState } from "@/side-panel/config.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";

interface RecordPanelProps {
  tabId: number;
  panelState: SidePanelState;
  setPanelState: React.Dispatch<React.SetStateAction<SidePanelState>>;
  sessionSummaries: SessionSummary[];
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  headerHeight: number;
  testId?: string;
}

const RecordPanel = ({
  tabId,
  panelState,
  setPanelState,
  sessionSummaries,
  setSessionSummaries,
  headerHeight,
  testId,
}: RecordPanelProps) => {
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
            placeItems: "center",
          }}
        >
          <RecordButton
            sx={{
              width: "90%",
            }}
            tabId={tabId}
            panelState={panelState}
            setPanelState={setPanelState}
          />
          <StopButton
            sx={{
              width: "90%",
            }}
            tabId={tabId}
            panelState={panelState}
            setPanelState={setPanelState}
            setSessionSummaries={setSessionSummaries}
          />
        </Box>
      </Box>
      <Box
        sx={{
          marginTop: `${buttonHeight + 8}px`,
          height: `calc(100vh - ${headerHeight + buttonHeight + 8}px)`,
          overflowY: "auto",
          // scrollbar
          "&::-webkit-scrollbar": {
            width: "12px", // 8 + 2(left) + 2(right)
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: grey[700],
            borderRadius: "4px",
            borderLeft: "2px solid transparent",
            borderRight: "2px solid transparent",
            backgroundClip: "padding-box",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            backgroundColor: grey[600],
          },
        }}
      >
        <SessionCardList
          tabId={tabId}
          sessionSummaries={sessionSummaries}
          setSessionSummaries={setSessionSummaries}
          imported={false}
          testId={testId}
        />
      </Box>
    </>
  );
};

export { RecordPanel };
