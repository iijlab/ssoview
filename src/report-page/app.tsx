/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { useEffect, useRef, useState } from "react";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SsoFlow } from "@/common/models/session-summary.ts";
import { deriveSsoFlowFromSamlLogs } from "@/common/services/saml-summarizer.ts";
import {
  buildHttpMessageRecord,
  getSamlAuthnRequestXml,
  getSamlResponseXml,
  loadFlowData,
} from "@/report-page/app-builders.ts";
import { type ContentSectionId } from "@/report-page/common/types.ts";
import { Content } from "@/report-page/content/content.tsx";
import { Sidebar } from "@/report-page/sidebar/sidebar.tsx";
import "./app.css";

type SessionData = {
  httpMessageRecord: Record<number, HttpMessage>;
  ssoFlow: SsoFlow;
  authnRequestXml?: string;
  responseXml?: string;
};

export function App() {
  const [sessionData, setSessionData] = useState<SessionData>();

  useEffect(() => {
    const fetchSessionData = async () => {
      const params = new URLSearchParams(window.location.search);
      const ssoTraceId = params.get("sessionId");

      const flowData = await loadFlowData(ssoTraceId);
      if (flowData instanceof Error) {
        console.warn("Failed to load flow data:", { error: flowData });
        return;
      }
      const { ssoTrace, tracingSession, samlLogs, httpMessages } = flowData;

      const httpMessageRecord = buildHttpMessageRecord(samlLogs, httpMessages);
      if (Object.keys(httpMessageRecord).length === 0) {
        console.warn("No HTTP messages for the SAML logs");
        return;
      }

      const ssoFlow = deriveSsoFlowFromSamlLogs(ssoTrace, tracingSession, samlLogs);
      const authnRequestXml = await getSamlAuthnRequestXml(httpMessageRecord);
      const responseXml = await getSamlResponseXml(httpMessageRecord);

      setSessionData({ httpMessageRecord, ssoFlow, authnRequestXml, responseXml });
    };

    fetchSessionData();
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  const contentSectionRefs = useRef<Partial<Record<ContentSectionId, HTMLElement | null>>>({});
  const isScrollingByClickRef = useRef(false);

  const [activeSectionId, setActiveSectionId] = useState<ContentSectionId>("session-summary");

  useEffect(() => {
    if (!mainRef.current) {
      return;
    }
    const main = mainRef.current;

    const handleScroll = () => {
      // Skip active section detection during click-triggered scroll
      if (isScrollingByClickRef.current) {
        return;
      }

      // The section containing this point is considered active
      const triggerPoint = main.scrollTop + main.clientHeight * 0.4;

      // Sort sections by offsetTop (top to bottom)
      const orderedSections = (
        Object.entries(contentSectionRefs.current) as [ContentSectionId, HTMLElement | null][]
      )
        .filter((entry): entry is [ContentSectionId, HTMLElement] => entry[1] !== null)
        .toSorted(([, a], [, b]) => a.offsetTop - b.offsetTop);

      const activeSection = (() => {
        // Reached the bottom?
        if (main.scrollHeight <= main.scrollTop + main.clientHeight) {
          // Activate the last section
          return orderedSections.at(-1);
        } else {
          return (
            orderedSections
              // All sections whose top edge has passed the trigger point
              .filter(([, el]) => el.offsetTop <= triggerPoint)
              // The last one contains trigger point - the active section
              .at(-1)
          );
        }
      })();

      if (activeSection) {
        setActiveSectionId(activeSection[0]);
      }
    };

    const handleScrollEnd = () => {
      isScrollingByClickRef.current = false;
    };

    // Set initial state
    handleScroll();

    main.addEventListener("scroll", handleScroll);
    main.addEventListener("scrollend", handleScrollEnd);
    return () => {
      main.removeEventListener("scroll", handleScroll);
      main.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [sessionData]);

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (sectionId: ContentSectionId) => {
    const el = contentSectionRefs.current[sectionId];
    if (el && mainRef.current) {
      isScrollingByClickRef.current = true;
      setActiveSectionId(sectionId);
      mainRef.current.scrollTo({ top: el.offsetTop, behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-screen bg-slate-800 text-gray-100">
      {sessionData && (
        <>
          <aside className="w-96">
            <Sidebar
              httpMessageRecord={sessionData.httpMessageRecord}
              ssoFlow={sessionData.ssoFlow}
              activeSectionId={activeSectionId}
              onLogoClick={scrollToTop}
              onArrowClick={scrollToSection}
            />
          </aside>
          <main className="flex-1 overflow-y-auto" ref={mainRef}>
            <Content
              httpMessageRecord={sessionData.httpMessageRecord}
              ssoFlow={sessionData.ssoFlow}
              authnRequestXml={sessionData.authnRequestXml}
              responseXml={sessionData.responseXml}
              sectionRefs={contentSectionRefs}
            />
          </main>
        </>
      )}
    </div>
  );
}
