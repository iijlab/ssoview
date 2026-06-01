/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import { IconButton, type IconButtonOwnProps, Tooltip } from "@mui/material";
import { FileDownload } from "@mui/icons-material";
// local
import { dumpSessionArchive } from "@/common/services/session-archiver.ts";

interface SaveButtonProps extends IconButtonOwnProps {
  tabId: number;
  id: string;
  testId?: string;
}

const SaveButton = ({ tabId, id, testId, ...rest }: SaveButtonProps) => {
  const onClickSave = async (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // Stop propagating click events to SessionCard
    ev.stopPropagation();
    console.info(`[${tabId}]: Click the Save button`);
    // Send message to service-worker
    const result = await dumpSessionArchive(tabId, id);
    if (result instanceof Error) {
      console.error(`[${tabId}]: Failed to dump session:`, result);
      return;
    }
    const downloadUrl = URL.createObjectURL(
      new Blob([result], {
        type: "application/har+json", // Set the extension to .har
      }),
    );
    console.debug(`[${tabId}]: Create download URL:`, downloadUrl);
    await chrome.downloads.download({
      url: downloadUrl,
      filename: `${id}.json`,
      saveAs: true,
    });
    URL.revokeObjectURL(downloadUrl); // Releases an existing object URL
  };

  return (
    <Tooltip title="SAVE">
      <span>
        <IconButton
          {...rest}
          color="primary"
          name="save"
          onClick={onClickSave}
          data-testid={testId}
        >
          <FileDownload />
        </IconButton>
      </span>
    </Tooltip>
  );
};

export { SaveButton };
