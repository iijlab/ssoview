/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import { IconButton, type IconButtonOwnProps, Tooltip } from "@mui/material";
import { DeleteForever } from "@mui/icons-material";
// local
import { deleteSession, getSessionSummaries } from "@/common/services/session-manager.ts";
import type { SessionSummary } from "@/common/models/session-summary.ts";

interface RemoveButtonProps extends IconButtonOwnProps {
  tabId: number;
  id: string;
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}

const RemoveButton = ({ tabId, id, setSessionSummaries, testId, ...rest }: RemoveButtonProps) => {
  const onClickRemove = async (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // Stop propagating click events to SessionCard
    ev.stopPropagation();
    console.info(`[${tabId}]: Click the Remove button`);
    // Send message to service-worker
    const result = await deleteSession(tabId, id);
    if (result instanceof Error) {
      console.error(`[${tabId}]: Failed to remove session:`, result);
      return;
    }
    console.info(`[${tabId}]: Remove session:`, id);
    // Update SessionCardList
    const sessions = await getSessionSummaries(tabId);
    if (sessions instanceof Error) {
      console.error(`[${tabId}]: Failed to getSessionSummaries:`, sessions);
      return;
    }
    setSessionSummaries(sessions);
  };

  return (
    <Tooltip title="REMOVE">
      <span>
        <IconButton
          {...rest}
          color="secondary"
          name="remove"
          onClick={onClickRemove}
          data-testid={testId}
        >
          <DeleteForever />
        </IconButton>
      </span>
    </Tooltip>
  );
};

export { RemoveButton };
