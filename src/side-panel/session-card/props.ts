/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import React from "react";
import type { SxProps, Theme } from "@mui/material";
// side-panel
import { formatRFC3339 } from "@/side-panel/utils.ts";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";

interface SessionCardStyles {
  borderColor: string;
  borderStyle: string;
  borderWidth: string;
}

// Calculate styles from SessionSummary
//
// | (s.imported, s.captured) | borderStyle | borderWidth |
// | ------------------------ | ----------- | ----------- |
// | (false, true)            | solid       | 4px         |
// | (false, false)           | solid       | 2px         |
// | ~(true, true)~           | ~dashed~    | ~2px~       |
// | (true, false)            | dashed      | 2px         |
//
// | (s.status)    | borderColor  |
// | ------------- | ------------ |
// | (in_progress) | warning.main |
// | (succeeded)   | primary.main |
// | (failed)      | error.main   |
//
const setSessionCardStyles = (s: SessionSummary) => {
  // Typical successful combinations
  let styles: SessionCardStyles = {
    borderColor: "primary.main",
    borderStyle: "solid",
    borderWidth: "2px",
  };

  const changeStyles = {
    active: {
      borderWidth: "4px",
    },
    imported: {
      borderStyle: "dashed",
    },
    progress: {
      borderColor: "warning.main",
    },
    succeeded: {
      // place-holder
    },
    failed: {
      borderColor: "error.main",
    },
  };

  if (s.imported) {
    styles = { ...styles, ...changeStyles.imported };
  } else if (s.capturing) {
    styles = { ...styles, ...changeStyles.active };
  }

  switch (s.status) {
    case "in_progress":
      styles = { ...styles, ...changeStyles.progress };
      break;
    case "succeeded":
      styles = { ...styles, ...changeStyles.succeeded };
      break;
    case "failed":
      styles = { ...styles, ...changeStyles.failed };
      break;
    default:
    // DONOTHING
  }
  console.debug(styles);

  return styles;
};

interface SessionCardProps {
  tabId: number;
  sx: SxProps<Theme>;
  disabled: boolean;
  id: string;
  hostname: string;
  startTime: string;
  endTime: string;
  idp: string;
  status: string;
  alert: string;
  setSessionSummaries: React.Dispatch<React.SetStateAction<SessionSummary[]>>;
  testId?: string;
}

const sessionSummaryToCardProps = (s: SessionSummary): SessionCardProps => {
  return {
    tabId: NaN,
    sx: setSessionCardStyles(s),
    disabled: !s.imported && s.capturing,
    id: s.sessionId,
    hostname: s.sp ?? "",
    startTime: s.start != undefined ? formatRFC3339(s.start) : "",
    endTime: s.end != undefined ? formatRFC3339(s.end) : "",
    idp: s.idp ?? "",
    status: s.status ?? "",
    alert: s.warning[0] ?? "",
    setSessionSummaries: () => {
      return [];
    },
  };
};

export { sessionSummaryToCardProps };
export type { SessionCardStyles, SessionCardProps };
