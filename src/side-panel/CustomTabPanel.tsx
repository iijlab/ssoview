/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import type { ReactNode } from "react";
import { Box } from "@mui/material";

interface CustomTabPanelProps {
  children?: ReactNode;
  index: number;
  value: number;
}

const CustomTabPanel = ({ children, value, index, ...other }: CustomTabPanelProps) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
};

export { CustomTabPanel };
