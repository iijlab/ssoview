/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { Activity, type SyntheticEvent, useEffect, useRef, useState } from "react";
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
// local
import type { SessionSummary } from "@/common/models/session-summary.ts";
import {
  type CaptureTerminatedReason,
  subscribeCaptureTerminatedEvent,
  subscribeSessionUpdateEvent,
} from "@/common/pubsub.ts";
import { getSessionSummaries } from "@/common/services/session-manager.ts";

const a11yProps = (index: number) => {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
};

const SidePanel = ({ tabId, testId }: { tabId: number; testId?: string }) => {
  const [panelState, setPanelState] = useState<SidePanelState>(SidePanelState.STOPPED);
  const [sessionSummaries, setSessionSummaries] = useState<SessionSummary[]>([]);

  // Subscribe here, outside <Activity>. A subscription cannot be removed, and the effects of the
  // components inside <Activity> run again each time their tab is shown again.
  // tabId does not change while the side panel is open, so the handlers keep using the first one.
  const subscribedRef = useRef(false);
  useEffect(() => {
    // Run once, also when <StrictMode> runs the effects twice
    if (subscribedRef.current) {
      return;
    }
    subscribedRef.current = true;

    // Update
    {
      const err = subscribeSessionUpdateEvent(
        async (subscribeTabId: number, sessionId: string): Promise<void> => {
          const result = await getSessionSummaries(subscribeTabId);
          if (result instanceof Error) {
            console.error(`[${subscribeTabId}]: Failed to getSessionSummaries:`, result);
            return;
          }
          console.debug(`[${subscribeTabId}]: Session updated:`, {
            sessionId,
            sessionSummaries: result,
          });
          setSessionSummaries(result);
        },
      );
      if (err instanceof Error) {
        // Go on, so that the sessions already stored are still shown
        console.error(`[${tabId}]: subscribeSessionUpdateEvent failed:`, err);
      }
    }
    // Terminate
    {
      const err = subscribeCaptureTerminatedEvent(
        async (subscribeTabId: number, reason: CaptureTerminatedReason): Promise<void> => {
          console.info(`[${tabId}]: CaptureTerminatedEvent occurred:`, reason);
          // Managing state
          setPanelState(SidePanelState.STOPPED);
          // Update SessionCardList
          if (tabId !== subscribeTabId) {
            console.warn(`[${tabId}]: tabId mismatched: subscribeTabId = ${subscribeTabId}`);
            return;
          }
          const result = await getSessionSummaries(tabId);
          if (result instanceof Error) {
            console.error(`[${tabId}]: Failed to getSessionSummaries:`, result);
            return;
          }
          console.debug(`[${tabId}]: Session updated:`, { sessionSummaries: result });
          setSessionSummaries(result);
        },
      );
      if (err instanceof Error) {
        console.error(`[${tabId}]: subscribeCaptureTerminatedEvent failed:`, err);
      }
    }
    // Initialize
    getSessionSummaries(tabId).then((result) => {
      if (result instanceof Error) {
        console.error(`[${tabId}]: Failed to getSessionSummaries:`, result);
        return;
      }
      console.debug(`[${tabId}]: Session initialized:`, { sessionSummaries: result });
      setSessionSummaries(result);
    });
  }, [tabId]);

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
          <Activity mode={tabValue === 0 ? "visible" : "hidden"}>
            <RecordPanel
              tabId={tabId}
              panelState={panelState}
              setPanelState={setPanelState}
              sessionSummaries={sessionSummaries}
              setSessionSummaries={setSessionSummaries}
              headerHeight={headerHeight}
              testId={testId}
            />
          </Activity>
          <Activity mode={tabValue === 1 ? "visible" : "hidden"}>
            <SessionPanel
              tabId={tabId}
              panelState={panelState}
              setPanelState={setPanelState}
              sessionSummaries={sessionSummaries}
              setSessionSummaries={setSessionSummaries}
              headerHeight={headerHeight}
              testId={testId}
            />
          </Activity>
        </Box>
      </ThemeProvider>
    </>
  );
};

export { SidePanel };
