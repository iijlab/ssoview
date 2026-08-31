/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { useEffect, useRef, useState } from "react";
import {
  type HttpMessage,
  type HttpRequest,
  type HttpResponse,
} from "@/common/models/http-message.ts";
import { type SamlDetection } from "@/common/models/saml-detection.ts";
import { type SamlTrace, newSamlTrace } from "@/common/models/saml-trace.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { retrieveHttpMessages } from "@/common/services/http-store.ts";
import {
  detectSamlStepFromHttpRequest,
  detectSamlStepFromHttpResponse,
  extractSamlAuthnRequestXml,
  extractSamlResponseXml,
} from "@/common/services/saml-detector.ts";
import { summarizeSamlSession } from "@/common/services/saml-summarizer.ts";
import { type ContentSectionId } from "@/report-page/common/types.ts";
import { Content } from "@/report-page/content/content.tsx";
import { Sidebar } from "@/report-page/sidebar/sidebar.tsx";
import "./app.css";

type SessionData = {
  httpMessageRecord: Record<number, HttpMessage>;
  sessionSummary: SessionSummary;
  authnRequestXml?: string;
  responseXml?: string;
};

export function App() {
  const [sessionData, setSessionData] = useState<SessionData>();

  useEffect(() => {
    const fetchSessionData = async () => {
      const params = new URLSearchParams(window.location.search);
      const tabId = Number(params.get("tabId"));
      const sessionId = params.get("sessionId");

      const httpMessages = await loadHttpMessages(tabId, sessionId);
      if (httpMessages instanceof Error) {
        console.warn("Failed to load HTTP messages:", { error: httpMessages });
        return;
      }

      const httpMessageRecord = await buildHttpMessageRecord(httpMessages);
      if (Object.keys(httpMessageRecord).length === 0) {
        console.warn("No SAML steps detected");
        return;
      }

      const samlTraces = await buildSamlTraces(httpMessages);
      if (samlTraces.length === 0) {
        console.warn("No SAML traces");
        return;
      }

      const sessionSummary = summarizeSamlSession(samlTraces[0]!.sessionId, samlTraces);
      const authnRequestXml = await extractSamlAuthnRequestXmlFromHttpMessages(httpMessages);
      const responseXml = await extractSamlResponseXmlFromHttpMessages(httpMessages);

      setSessionData({ httpMessageRecord, sessionSummary, authnRequestXml, responseXml });
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
              sessionSummary={sessionData.sessionSummary}
              activeSectionId={activeSectionId}
              onLogoClick={scrollToTop}
              onArrowClick={scrollToSection}
            />
          </aside>
          <main className="flex-1 overflow-y-auto" ref={mainRef}>
            <Content
              httpMessageRecord={sessionData.httpMessageRecord}
              sessionSummary={sessionData.sessionSummary}
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

async function loadHttpMessages(
  tabId: number,
  sessionId: string | null,
): Promise<HttpMessage[] | Error> {
  if (!Number.isSafeInteger(tabId) || tabId <= 0 || sessionId === null) {
    // In development mode, fall back to sample data
    if (import.meta.env.MODE === "development") {
      const { buildSampleHttpMessages } = await import("@/report-page/dev/sample-messages.ts");
      return buildSampleHttpMessages();
    } else {
      return new Error(`Invalid URL params: tabId=${tabId}, sessionId=${sessionId}`);
    }
  }

  return retrieveHttpMessages(tabId, sessionId);
}

async function buildSamlTraces(httpMessages: HttpMessage[]): Promise<SamlTrace[]> {
  const samlTraces = [];

  for (const httpMessage of httpMessages) {
    const samlDetection = await detectSamlStep(httpMessage, httpMessages);
    if (samlDetection instanceof Error) {
      console.error("Failed to detect SAML flow from HTTP message:", samlDetection);
      continue;
    } else if (!samlDetection) {
      continue;
    }

    const samlTrace = newSamlTrace(samlDetection, httpMessage);
    if (samlTrace instanceof Error) {
      console.error("Failed to build SAML trace from HTTP message:", samlTrace);
      continue;
    }

    samlTraces.push(samlTrace);
  }

  return samlTraces;
}

async function buildHttpMessageRecord(
  httpMessages: HttpMessage[],
): Promise<Record<number, HttpMessage>> {
  const httpMessageRecord: Record<number, HttpMessage> = {};

  for (const httpMessage of httpMessages) {
    const samlDetection = await detectSamlStep(httpMessage, httpMessages);
    if (samlDetection instanceof Error) {
      console.error("Failed to detect SAML flow from HTTP message:", samlDetection);
      continue;
    } else if (!samlDetection) {
      continue;
    }

    httpMessageRecord[samlDetection.step] = httpMessage;
  }

  // Infer step 1 from the message just before step 2
  if (!(1 in httpMessageRecord) && 2 in httpMessageRecord) {
    const step2HttpMessage = httpMessageRecord[2];
    const step2Index = httpMessages.indexOf(step2HttpMessage);
    if (0 < step2Index) {
      httpMessageRecord[1] = httpMessages[step2Index - 1]!;
    } else {
      console.warn("Could not infer step 1 because no message was found before step 2");
    }
  }

  return httpMessageRecord;
}

async function detectSamlStep(
  httpMessage: HttpMessage,
  httpMessages: HttpMessage[],
): Promise<SamlDetection | undefined | Error> {
  if (httpMessage.stage === "Request") {
    return detectSamlStepFromHttpRequest(httpMessage);
  } else {
    const pairedHttpRequest = findPairedHttpRequest(httpMessage, httpMessages);
    if (pairedHttpRequest === undefined) {
      return new Error(`No paired HTTP request for HTTP response: ${httpMessage.id}`);
    }

    return detectSamlStepFromHttpResponse(httpMessage, pairedHttpRequest);
  }
}

function findPairedHttpRequest(
  httpResponse: HttpResponse,
  httpMessages: HttpMessage[],
): HttpRequest | undefined {
  const pairedHttpRequest = httpMessages.find((m) => m.id === httpResponse.pairedHttpRequestId);
  return pairedHttpRequest?.stage === "Request" ? pairedHttpRequest : undefined;
}

async function extractSamlAuthnRequestXmlFromHttpMessages(
  httpMessages: HttpMessage[],
): Promise<string | undefined> {
  const httpMessage = await (async () => {
    for (const httpMessage of httpMessages) {
      const samlDetection = await detectSamlStep(httpMessage, httpMessages);
      if (samlDetection instanceof Error) {
        console.error("Failed to detect SAML flow from HTTP message:", samlDetection);
        continue;
      } else if (!samlDetection) {
        continue;
      } else if (samlDetection.step === 2 || samlDetection.step === 3) {
        return httpMessage;
      }
    }
    return undefined;
  })();
  if (!httpMessage) {
    return undefined;
  }

  const authnRequestXml = await extractSamlAuthnRequestXml(httpMessage);
  if (authnRequestXml instanceof Error) {
    console.warn("Failed to extract SAML AuthnRequest XML:", authnRequestXml);
    return undefined;
  }

  return authnRequestXml;
}

async function extractSamlResponseXmlFromHttpMessages(
  httpMessages: HttpMessage[],
): Promise<string | undefined> {
  const httpMessage = await (async () => {
    for (const httpMessage of httpMessages) {
      const samlDetection = await detectSamlStep(httpMessage, httpMessages);
      if (samlDetection instanceof Error) {
        console.error("Failed to detect SAML flow from HTTP message:", samlDetection);
        continue;
      } else if (!samlDetection) {
        continue;
      } else if (samlDetection.step === 4 || samlDetection.step === 5) {
        return httpMessage;
      }
    }
    return undefined;
  })();
  if (!httpMessage) {
    return undefined;
  }

  const responseXml = await extractSamlResponseXml(httpMessage);
  if (responseXml instanceof Error) {
    console.warn("Failed to extract SAML Response XML:", responseXml);
    return undefined;
  }

  return responseXml;
}
