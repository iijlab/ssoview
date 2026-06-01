/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { useRef, useState } from "react";
import { Box, Tooltip } from "@mui/material";

const EllipsisTooltip = ({ children }: { children: string }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTooltip, setIsTooltip] = useState(false);

  const onMouseEnter = () => {
    const el = textRef.current;
    if (el) {
      // Check if the content width exceeds the display width
      setIsTooltip(el.scrollWidth > el.offsetWidth);
    }
  };

  return (
    <Tooltip title={children} disableHoverListener={!isTooltip}>
      <Box
        ref={textRef}
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          width: "100%",
        }}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </Box>
    </Tooltip>
  );
};

export { EllipsisTooltip };
