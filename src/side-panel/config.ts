/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

const SidePanelState = {
  STOPPED: "STOPPED",
  RECORDING: "RECORDING",
  // LOADING: "LOADING",
} as const;

type SidePanelState = (typeof SidePanelState)[keyof typeof SidePanelState];

export { SidePanelState };
