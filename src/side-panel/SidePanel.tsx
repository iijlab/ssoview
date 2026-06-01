/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import {
  AppBar,
  Box,
  createTheme,
  CssBaseline,
  Tab,
  Tabs,
  ThemeProvider,
  Toolbar,
} from "@mui/material";
import { lightGreen } from "@mui/material/colors";
// side-panel
import { RecordPanel } from "@/side-panel/record-panel/RecordPanel.tsx";
import { SessionPanel } from "@/side-panel/session-panel/SessionPanel.tsx";
import { SidePanelState } from "@/side-panel/config.ts";
// tab-panel
import { a11yProps } from "@/side-panel/utils.ts";
import { CustomTabPanel } from "@/side-panel/CustomTabPanel.tsx";
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";

const SidePanel = ({ tabId, testId }: { tabId: number; testId?: string }) => {
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);

  const [tabValue, setTabValue] = useState(0);
  const onChangeTab = (_event: SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    if (headerRef?.current) {
      const { height } = headerRef.current.getBoundingClientRect();
      setHeaderHeight(height);
    }
  }, [headerRef]);
  useEffect(() => {
    console.debug(`[${tabId}] headerHeight:`, headerHeight);
  }, [tabId, headerHeight]);

  const theme = createTheme({
    palette: {
      mode: "dark", // Fix it.
    },
  });

  return (
    <>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ width: "100%", backgroundColor: "background.paper" }}>
          <AppBar ref={headerRef} position="fixed">
            <Toolbar>
              <Tabs
                sx={{ width: "100%" }}
                value={tabValue}
                onChange={onChangeTab}
                variant="fullWidth"
              >
                <Tab
                  label="Record"
                  {...a11yProps(0)}
                  sx={{ textTransform: "none", fontSize: "1.25rem" }}
                />
                <Tab
                  label="Saved"
                  {...a11yProps(1)}
                  sx={{ textTransform: "none", fontSize: "1.25rem" }}
                />
              </Tabs>
            </Toolbar>
          </AppBar>
          <Box
            sx={{
              position: "fixed",
              top: "6px",
              right: "8px",
              zIndex: "calc(infinity)",
              display: panelState === "RECORDING" ? "block" : "none",
              backgroundColor: lightGreen["A400"],
              width: "10px",
              height: "10px",
              borderRadius: "50%",
            }}
          />
          <Toolbar />
          <CustomTabPanel value={tabValue} index={0}>
            <RecordPanel
              tabId={tabId}
              panelState={panelState}
              setPanelState={setPanelState}
              sessionSummaries={sessionSummaries}
              setSessionSummaries={setSessionSummaries}
              headerHeight={headerHeight}
              testId={testId}
            />
          </CustomTabPanel>
          <CustomTabPanel value={tabValue} index={1}>
            <SessionPanel
              tabId={tabId}
              panelState={panelState}
              setPanelState={setPanelState}
              sessionSummaries={sessionSummaries}
              setSessionSummaries={setSessionSummaries}
              headerHeight={headerHeight}
              testId={testId}
            />
          </CustomTabPanel>
        </Box>
      </ThemeProvider>
    </>
  );
};

export { SidePanel };
