/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { Box, Card, CardActions, CardContent } from "@mui/material";
// side-panel
import { SaveButton } from "@/side-panel/session-card/SaveButton.tsx";
import { RemoveButton } from "@/side-panel/session-card/RemoveButton.tsx";
import type { SessionCardProps } from "@/side-panel/session-card/props.ts";
import { EllipsisTooltip } from "@/side-panel/session-card/EllipsisTooltip.tsx";

const SessionCardItem = ({ itemKey, itemVal }: { itemKey: string; itemVal: string }) => {
  return (
    <>
      <Box sx={{ fontWeight: "bold" }}>{itemKey}</Box>
      <EllipsisTooltip children={itemVal} />
    </>
  );
};

const SessionCard = ({
  tabId,
  sx,
  disabled,
  id,
  hostname,
  startTime,
  endTime,
  idp,
  status,
  alert,
  setSessionSummaries,
  testId,
}: SessionCardProps) => {
  let saveButtonTestId, removeButtonTestId;
  let saveButtonBoundaryTestId, removeButtonBoundaryTestId;
  if (testId) {
    saveButtonTestId = "save-button";
    removeButtonTestId = "remove-button";
    saveButtonBoundaryTestId = "save-button-boundary";
    removeButtonBoundaryTestId = "remove-button-boundary";
  }
  // Avoid tsc errors: TS2769: No overload matches this call.
  const sxProps = { ...sx } as const;

  const onClickMore = async () => {
    const tab = await chrome.tabs.create({ url: `report.html?tabId=${tabId}&sessionId=${id}` });
    console.info("create extension tab:", tab.id);
  };

  return (
    <Card
      sx={[
        sxProps,
        { padding: "8px", borderRadius: "12px" },
        (theme) => ({
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
            cursor: "pointer",
          },
        }),
      ]}
      elevation={4}
      onClick={onClickMore}
      data-testid={testId}
    >
      <CardContent sx={{ padding: 0 }}>
        <Box
          sx={{
            textAlign: "center",
            fontSize: "1.125rem", // 18px
            lineHeight: 1.0, // 18px
            marginBottom: "4px",
            minHeight: "1lh",
          }}
        >
          <EllipsisTooltip children={hostname} />
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            fontSize: "0.875rem", // 14px
            lineHeight: "1rem", // 16px
            marginTop: "4px",
            marginBottom: "4px",
          }}
        >
          <SessionCardItem itemKey="Start:" itemVal={startTime} />
          <SessionCardItem itemKey="End:" itemVal={endTime} />
          <SessionCardItem itemKey="Identity Provider:" itemVal={idp} />
          <SessionCardItem itemKey="Status:" itemVal={status} />
          <SessionCardItem itemKey="Alert:" itemVal={alert} />
        </Box>
      </CardContent>
      <CardActions sx={{ padding: 0 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
            width: "100%",
          }}
        >
          <Box sx={{ gridRow: 1, gridColumnStart: 1, gridColumnEnd: 7, justifySelf: "center" }}>
            <Box></Box>
          </Box>
          <Box
            sx={{ gridRow: 1, gridColumnStart: 7, gridColumnEnd: 8, justifySelf: "center" }}
            onClick={(ev) => {
              console.debug(`[${tabId}]: SaveButton: Stop propagating click events to SessionCard`);
              ev.stopPropagation();
            }}
            data-testid={saveButtonBoundaryTestId}
          >
            <SaveButton
              tabId={tabId}
              sx={{ paddingTop: 0, paddingBottom: 0, paddingLeft: "4px", paddingRight: "4px" }}
              size="medium"
              id={id}
              testId={saveButtonTestId}
            />
          </Box>
          <Box
            sx={{ gridRow: 1, gridColumnStart: 8, gridColumnEnd: 9, justifySelf: "center" }}
            onClick={(ev) => {
              console.debug(
                `[${tabId}]: RemoveButton: Stop propagating click events to SessionCard`,
              );
              ev.stopPropagation();
            }}
            data-testid={removeButtonBoundaryTestId}
          >
            <RemoveButton
              tabId={tabId}
              sx={{ paddingTop: 0, paddingBottom: 0, paddingLeft: "4px", paddingRight: "4px" }}
              size="medium"
              disabled={disabled}
              id={id}
              setSessionSummaries={setSessionSummaries}
              testId={removeButtonTestId}
            />
          </Box>
        </Box>
      </CardActions>
    </Card>
  );
};

export { SessionCard };
