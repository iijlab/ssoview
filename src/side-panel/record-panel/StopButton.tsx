/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import { Fab, type FabOwnProps } from "@mui/material";
import { Stop } from "@mui/icons-material";
// side-panel
import { SidePanelState } from "@/side-panel/config.ts";
import { hideBadge } from "@/side-panel/extensions/badge.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";
import { stopMonitoring } from "@/common/rpc.ts";
import { getSessionSummaries } from "@/common/services/session-manager.ts";

interface StopButtonProps extends FabOwnProps {
  tabId: number;
  panelState: SidePanelState;
  setPanelState: React.Dispatch<React.SetStateAction<SidePanelState>>;
  setSessionSummaries?: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}

const StopButton = ({
  tabId,
  panelState,
  setPanelState,
  setSessionSummaries,
  testId,
  ...rest
}: StopButtonProps) => {
  const onClickStop = async () => {
    console.info(`[${tabId}]: Click the Stop button`);
    // Send message to service-worker
    const result = await stopMonitoring(tabId);
    if (result instanceof Error) {
      console.error(`[${tabId}]: Failed to stop monitoring:`, result);
      return;
    }
    // Managing state
    setPanelState(SidePanelState.STOPPED);
    hideBadge();
    // Update SessionCardList
    if (setSessionSummaries !== undefined) {
      const result = await getSessionSummaries(tabId);
      if (result instanceof Error) {
        console.error(`[${tabId}]: Failed to getSessionSummaries:`, result);
        return;
      }
      console.debug(`[${tabId}]: Session updated:`, { sessionSummaries: result });
      setSessionSummaries(result);
    }
  };

  return (
    <Fab
      {...rest}
      variant="extended"
      size="medium"
      color="primary"
      id="stop"
      name="stop"
      onClick={onClickStop}
      type="button"
      disabled={panelState !== SidePanelState.RECORDING}
      data-testid={testId}
    >
      <Stop sx={{ mr: 1 }} />
      STOP
    </Fab>
  );
};

export { StopButton };
