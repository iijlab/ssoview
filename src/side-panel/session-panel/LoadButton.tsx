/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React, { useRef } from "react";
import { Box, Fab, type FabOwnProps } from "@mui/material";
import { FileUpload } from "@mui/icons-material";
// side-panel
import { SidePanelState } from "@/side-panel/config.ts";
// local
import { loadSessionArchive } from "@/common/services/session-archiver.ts";
import type { SessionSummary } from "@/common/models/session-summary.ts";
import { getSessionSummaries } from "@/common/services/session-manager.ts";

const HideInput = ({
  ref,
  tabId,
  setSessionSummaries,
  testId,
}: {
  ref: React.RefObject<HTMLInputElement | null>;
  tabId: number;
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}) => {
  const onChangeInput = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    console.info(`[${tabId}]: Capture a change event by selecting files`);

    const fileList = ev.target.files;
    if (fileList === null) {
      console.error(`[${tabId}]: fileList is null`);
      return;
    }

    // Copy the files, then reset the input before loading. Otherwise selecting the same file
    // again does not fire onChange, including after a failed load.
    const files = Array.from(fileList);
    ev.target.value = "";

    await Promise.allSettled(
      files.map(async (file) => {
        // Read errors are logged here and resolved as Error values, like the services do.
        const har = await new Promise<string | Error>((resolve) => {
          // Create FileReader
          const reader = new FileReader();
          // Set EventHandler
          reader.addEventListener("load", () => {
            // Settle the promise for an empty file too, or the handler never finishes.
            if (!(reader.result instanceof ArrayBuffer) || reader.result.byteLength === 0) {
              const err = new Error(
                reader.result instanceof ArrayBuffer
                  ? "The file is empty"
                  : "The file was not read as an ArrayBuffer",
              );
              console.error(`[${tabId}]: Failed to read "${file.name}":`, err);
              resolve(err);
              return;
            }
            const utf8decoder = new TextDecoder("utf-8", { fatal: true }); // default "utf-8" or "utf8"
            try {
              const har = utf8decoder.decode(new Uint8Array(reader.result));
              console.debug(`[${tabId}]: Read from "${file.name}":`, JSON.parse(har));
              resolve(har);
            } catch (err) {
              if (err instanceof TypeError) {
                console.error(`[${tabId}]: Failed to TextDecoder.decode:`, err);
              } else if (err instanceof SyntaxError) {
                console.error(`[${tabId}]: Failed to JSON.parse:`, err);
              } else {
                console.error(`[${tabId}]: Failed to read "${file.name}":`, err);
              }
              resolve(err instanceof Error ? err : new Error(String(err)));
            }
          });
          reader.addEventListener("error", (err) => {
            console.error(`[${tabId}]: Failed to FileReader.readAsArrayBuffer(${file}):`, err);
            resolve(new Error("Failed to read the file"));
          });
          // Read a file
          reader.readAsArrayBuffer(file);
        });
        if (har instanceof Error) {
          // Already logged above
          return;
        }
        const ids = await loadSessionArchive(tabId, har);
        if (ids instanceof Error) {
          console.error(`[${tabId}]: Failed to loadSessionArchive:`, ids);
          return;
        }
        console.info(`[${tabId}]: Sent "${file.name}" to ServiceWorker`);
      }),
    );

    const sessions = await getSessionSummaries(tabId);
    if (sessions instanceof Error) {
      console.error(`[${tabId}]: Failed to getSessionSummaries:`, sessions);
      return;
    }
    setSessionSummaries(sessions);
    console.debug(`[${tabId}]: Session updated:`, { sessionSummaries: sessions });
  };

  // fix: support cancel event for input[type="file"]
  // https://github.com/facebook/react/pull/27897
  //
  // const onCancelInput = () => {
  //   console.debug("file selection canceled");
  // });

  return (
    <input
      ref={ref}
      type="file"
      id="loadFile"
      onChange={onChangeInput}
      // onCancel={onCancelInput}
      accept="application/json, .har, .json"
      multiple
      style={{ display: "none" }}
      data-testid={testId}
    />
  );
};

interface LoadButtonProps extends FabOwnProps {
  tabId: number;
  panelState: SidePanelState;
  setPanelState: React.Dispatch<React.SetStateAction<SidePanelState>>;
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}

const LoadButton = ({
  tabId,
  panelState,
  setPanelState,
  setSessionSummaries,
  testId,
  ...rest
}: LoadButtonProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const onClickLoad = async () => {
    console.info(`[${tabId}]: Click the Load button`);
    inputRef.current?.click(); // Send click event to <input> tag
  };

  return (
    <Box
      sx={{
        textAlign: "center",
        width: "100%",
      }}
    >
      <Fab
        {...rest}
        variant="extended"
        size="medium"
        color="primary"
        id="load"
        name="load"
        onClick={onClickLoad}
        type="button"
        disabled={panelState !== SidePanelState.STOPPED}
        aria-label="load"
      >
        <FileUpload sx={{ mr: 1 }} />
        Load
      </Fab>
      <HideInput
        ref={inputRef}
        tabId={tabId}
        setSessionSummaries={setSessionSummaries}
        testId={testId}
      />
    </Box>
  );
};

export { LoadButton };
