/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import { Fab, type FabOwnProps } from "@mui/material";
import { Start } from "@mui/icons-material";
// side-panel
import { BadgeColor, SidePanelState } from "@/side-panel/config.ts";
import { showBadge } from "@/side-panel/extensions/badge.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";
import { startMonitoring } from "@/common/rpc.ts";

interface RecordButtonProps extends FabOwnProps {
  tabId: number;
  panelState: SidePanelState;
  setPanelState: React.Dispatch<React.SetStateAction<SidePanelState>>;
  setSessionSummaries?: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}

const RecordButton = ({
  tabId,
  panelState,
  setPanelState,
  setSessionSummaries,
  testId,
  ...rest
}: RecordButtonProps) => {
  const onClickRecord = async () => {
    console.info(`[${tabId}]: Click the Record button`);
    // Send message to service-worker
    const result = await startMonitoring(tabId);
    if (result instanceof Error) {
      console.error(`[${tabId}]: Failed to start monitoring:`, result);
      return;
    }
    // Managing state
    setPanelState(SidePanelState.RECORDING);
    showBadge("REC", BadgeColor.REC_TEXT, BadgeColor.REC_BACKGROUND);
  };

  return (
    <Fab
      {...rest}
      variant="extended"
      size="medium"
      color="primary"
      id="record"
      name="record"
      onClick={onClickRecord}
      type="button"
      disabled={panelState !== SidePanelState.STOPPED}
      data-testid={testId}
    >
      <Start sx={{ mr: 1 }} />
      REC
    </Fab>
  );
};

export { RecordButton };
