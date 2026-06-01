/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { lightGreen } from "@mui/material/colors";

const BadgeColor = {
  REC_TEXT: "#000000FF", // Black
  REC_BACKGROUND: lightGreen["A400"],
} as const;

type BadgeColor = (typeof BadgeColor)[keyof typeof BadgeColor];

const IconPath = {
  ACTIVE: "../image/id-card-active-128x128.png",
  DEFAULT: "../image/id-card-default-128x128.png",
} as const;

type IconPath = (typeof IconPath)[keyof typeof IconPath];

const SidePanelState = {
  STOPPED: "STOPPED",
  RECORDING: "RECORDING",
  // LOADING: "LOADING",
} as const;

type SidePanelState = (typeof SidePanelState)[keyof typeof SidePanelState];

export { BadgeColor, IconPath, SidePanelState };
