/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { useRef, useEffect, useState } from "react";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { type ArrowClickHandler, type ContentSectionId } from "@/report-page/common/types.ts";
import { AuthPhase } from "./auth-phase.tsx";
import { HttpArrow } from "./http-arrow.tsx";
import { SamlArrow } from "./saml-arrow.tsx";
import { buildHttpMessageDataRecord } from "./sidebar-builders.ts";

const ACTOR_HEIGHT = 144;
const DIAGRAM_PADDING_BOTTOM = 8;
const HTTP_ARROW_HEIGHT = 72;
const AUTH_PHASE_SPACING_HEIGHT = 160;
const OVERLAY_PADDING_INLINE = 8;
const OVERLAY_PADDING_BLOCK = 16;

type SequenceDiagramProps = {
  httpMessageRecord: Record<number, HttpMessage>;
  sessionSummary: SessionSummary;
  activeSectionId: ContentSectionId;
  onArrowClick: ArrowClickHandler;
};

export function SequenceDiagram({
  httpMessageRecord,
  sessionSummary,
  activeSectionId,
  onArrowClick,
}: SequenceDiagramProps) {
  const spHost = sessionSummary.sp ?? "<unknown>";
  const idpHost = sessionSummary.idp ?? "<unknown>";
  const httpMessageDataRecord = buildHttpMessageDataRecord(spHost, idpHost, httpMessageRecord);

  //
  // Obtain coordinates for laying out HTTP messages
  //

  const userLaneRef = useRef<HTMLDivElement>(null);
  const spLaneRef = useRef<HTMLDivElement>(null);
  const idpLaneRef = useRef<HTMLDivElement>(null);
  const [diagramLayout, setDiagramLayout] = useState({
    messageBlockWidth: 0,
    laneCenters: { user: 0, sp: 0, idp: 0 },
    httpMessageTops: [0, 0, 0, 0, 0, 0],
  });

  useEffect(() => {
    const userLane = userLaneRef.current;
    const spLane = spLaneRef.current;
    const idpLane = idpLaneRef.current;
    if (!userLane || !spLane || !idpLane) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const userLaneRect = userLane.getBoundingClientRect();
      const userLaneWidth = userLaneRect.right - userLaneRect.left;
      const userLaneStartX = 0;
      const spLaneRect = spLane.getBoundingClientRect();
      const spLaneWidth = spLaneRect.right - spLaneRect.left;
      const spLaneStartX = spLaneRect.left - userLaneRect.left;
      const idpLaneRect = idpLane.getBoundingClientRect();
      const idpLaneWidth = idpLaneRect.right - idpLaneRect.left;
      const idpLaneStartX = idpLaneRect.left - userLaneRect.left;

      const diagramHeight = userLaneRect.bottom - userLaneRect.top;
      const availableHeight = diagramHeight - ACTOR_HEIGHT - DIAGRAM_PADDING_BOTTOM;
      const gap = Math.floor(
        (availableHeight - HTTP_ARROW_HEIGHT * 6 - AUTH_PHASE_SPACING_HEIGHT) / 4,
      );
      const httpMessage1Top = ACTOR_HEIGHT;
      const httpMessage2Top = httpMessage1Top + HTTP_ARROW_HEIGHT + gap;
      const httpMessage3Top = httpMessage2Top + HTTP_ARROW_HEIGHT + gap;
      const httpMessage4Top = httpMessage3Top + HTTP_ARROW_HEIGHT + AUTH_PHASE_SPACING_HEIGHT;
      const httpMessage5Top = httpMessage4Top + HTTP_ARROW_HEIGHT + gap;
      const httpMessage6Top = httpMessage5Top + HTTP_ARROW_HEIGHT + gap;

      setDiagramLayout({
        messageBlockWidth: idpLaneRect.right - userLaneRect.left,
        laneCenters: {
          user: userLaneStartX + userLaneWidth / 2,
          sp: spLaneStartX + spLaneWidth / 2,
          idp: idpLaneStartX + idpLaneWidth / 2,
        },
        httpMessageTops: [
          httpMessage1Top,
          httpMessage2Top,
          httpMessage3Top,
          httpMessage4Top,
          httpMessage5Top,
          httpMessage6Top,
        ],
      });
    });

    observer.observe(userLane);
    observer.observe(spLane);
    observer.observe(idpLane);
    return () => observer.disconnect();
  }, []);

  //
  // Obtain coordinates for laying out SAML messages
  //

  const httpContextLayerContainerRef = useRef<HTMLDivElement>(null);
  const httpMessageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [samlRequestLayout, setSamlRequestLayout] = useState({
    top: 0,
    startY: 0,
    endY: 0,
  });
  const [samlResponseLayout, setSamlResponseLayout] = useState({
    top: 0,
    startY: 0,
    endY: 0,
  });

  useEffect(() => {
    const container = httpContextLayerContainerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const containerRect = container.getBoundingClientRect();

      // Overlay SAML request on HTTP messages 2 and 3
      const httpMessage2 = httpMessageRefs.current[1];
      const httpMessage3 = httpMessageRefs.current[2];
      if (httpMessage2 && httpMessage3) {
        const httpMessage2Rect = httpMessage2.getBoundingClientRect();
        const httpMessage3Rect = httpMessage3.getBoundingClientRect();
        setSamlRequestLayout({
          top: httpMessage2Rect.top - containerRect.top,
          startY: httpMessage2Rect.bottom - httpMessage2Rect.top,
          endY: httpMessage3Rect.bottom - httpMessage2Rect.top,
        });
      }

      // Overlay SAML response on HTTP messages 4 and 5
      const httpMessage4 = httpMessageRefs.current[3];
      const httpMessage5 = httpMessageRefs.current[4];
      if (httpMessage4 && httpMessage5) {
        const httpMessage4Rect = httpMessage4.getBoundingClientRect();
        const httpMessage5Rect = httpMessage5.getBoundingClientRect();
        setSamlResponseLayout({
          top: httpMessage4Rect.top - containerRect.top,
          startY: httpMessage4Rect.bottom - httpMessage4Rect.top,
          endY: httpMessage5Rect.bottom - httpMessage4Rect.top,
        });
      }
    });

    observer.observe(container);
    httpMessageRefs.current.forEach((msg) => {
      if (msg) {
        observer.observe(msg);
      }
    });
    return () => observer.disconnect();
  }, [diagramLayout.httpMessageTops]);

  //
  // Obtain coordinates for laying out the user authentication phase
  //

  const samlContextLayerContainerRef = useRef<HTMLDivElement>(null);
  const samlRequestRef = useRef<HTMLDivElement>(null);
  const samlResponseRef = useRef<HTMLDivElement>(null);
  const [authPhaseLayout, setAuthPhaseLayout] = useState({
    top: 0,
    bottom: 0,
  });

  useEffect(() => {
    const container = samlContextLayerContainerRef.current;
    const samlRequest = samlRequestRef.current;
    const samlResponse = samlResponseRef.current;
    if (!container || !samlRequest) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const containerRect = container.getBoundingClientRect();
      const samlRequestRect = samlRequest.getBoundingClientRect();
      if (samlResponse) {
        const samlResponseRect = samlResponse.getBoundingClientRect();
        setAuthPhaseLayout({
          top: samlRequestRect.bottom - containerRect.top,
          bottom: containerRect.bottom - samlResponseRect.top,
        });
      } else {
        setAuthPhaseLayout({
          top: samlRequestRect.bottom - containerRect.top,
          bottom:
            containerRect.bottom - (containerRect.top + (diagramLayout.httpMessageTops[3] ?? 0)),
        });
      }
    });

    observer.observe(container);
    observer.observe(samlRequest);
    if (samlResponse) {
      observer.observe(samlResponse);
    }
    return () => observer.disconnect();
  }, [diagramLayout.httpMessageTops]);

  return (
    <div className="relative h-full min-h-240 pointer-events-none">
      {/* Background Layer */}
      <div className="flex gap-4 h-full">
        {/* User Lane */}
        <div
          ref={userLaneRef}
          className="flex flex-1 flex-col rounded-lg border border-gray-700 bg-gray-950 min-w-0"
        >
          <div className="pt-4 text-center">
            <div className="mb-2 text-4xl">💻</div>
            <div className="text-sm wrap-anywhere px-2">User</div>
          </div>
        </div>

        {/* Service Provider Lane */}
        <div
          ref={spLaneRef}
          className="flex flex-1 flex-col rounded-lg border border-gray-700 bg-gray-950 min-w-0"
        >
          <div className="pt-4 text-center">
            <div className="mb-2 text-4xl">🌐</div>
            <div className="text-sm wrap-anywhere px-2">{breakAtDots(spHost)}</div>
          </div>
        </div>

        {/* Identity Provider Lane */}
        <div
          ref={idpLaneRef}
          className="flex flex-1 flex-col rounded-lg border border-gray-700 bg-gray-950 min-w-0"
        >
          <div className="pt-4 text-center">
            <div className="mb-2 text-4xl">🔐</div>
            <div className="text-sm wrap-anywhere px-2">{breakAtDots(idpHost)}</div>
          </div>
        </div>
      </div>

      {/* SAML Context Layer */}
      <div ref={samlContextLayerContainerRef} className="absolute inset-0">
        {2 in httpMessageRecord && 3 in httpMessageRecord && (
          <div
            ref={samlRequestRef}
            className="absolute bg-purple-950/50 border border-purple-400 rounded-lg"
            style={{
              paddingInline: OVERLAY_PADDING_INLINE,
              paddingBlock: OVERLAY_PADDING_BLOCK,
              top: samlRequestLayout.top - OVERLAY_PADDING_BLOCK,
              left: -OVERLAY_PADDING_INLINE,
            }}
          >
            <div className="relative z-10">
              <SamlArrow
                sessionSummary={sessionSummary}
                sectionId="saml-request"
                containerWidth={diagramLayout.messageBlockWidth}
                startX={diagramLayout.laneCenters["sp"]}
                startY={samlRequestLayout.startY}
                endX={diagramLayout.laneCenters["idp"]}
                endY={samlRequestLayout.endY}
                turnX={diagramLayout.laneCenters["user"]}
                onClick={onArrowClick}
                isActive={activeSectionId === "saml-request"}
              />
            </div>
          </div>
        )}

        {(3 in httpMessageRecord ||
          4 in httpMessageRecord ||
          5 in httpMessageRecord ||
          6 in httpMessageRecord) && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: authPhaseLayout.top,
              bottom: authPhaseLayout.bottom,
              left: -OVERLAY_PADDING_INLINE,
              right: -OVERLAY_PADDING_INLINE,
            }}
          >
            <div className="w-full bg-blue-950/50 border border-blue-400 rounded-lg">
              <AuthPhase />
            </div>
          </div>
        )}

        {4 in httpMessageRecord && 5 in httpMessageRecord && (
          <div
            ref={samlResponseRef}
            className="absolute bg-purple-950/50 border border-purple-400 rounded-lg"
            style={{
              paddingInline: OVERLAY_PADDING_INLINE,
              paddingBlock: OVERLAY_PADDING_BLOCK,
              top: samlResponseLayout.top - OVERLAY_PADDING_BLOCK,
              left: -OVERLAY_PADDING_INLINE,
            }}
          >
            <div className="relative z-10">
              <SamlArrow
                sessionSummary={sessionSummary}
                sectionId="saml-response"
                containerWidth={diagramLayout.messageBlockWidth}
                startX={diagramLayout.laneCenters["idp"]}
                startY={samlResponseLayout.startY}
                endX={diagramLayout.laneCenters["sp"]}
                endY={samlResponseLayout.endY}
                turnX={diagramLayout.laneCenters["user"]}
                onClick={onArrowClick}
                isActive={activeSectionId === "saml-response"}
              />
            </div>
          </div>
        )}
      </div>

      {/* HTTP Context Layer */}
      <div ref={httpContextLayerContainerRef} className="absolute inset-0">
        {Object.entries(httpMessageDataRecord).map(([stepStr, { from, to, ...props }]) => {
          const step = Number(stepStr);
          return (
            <div
              key={step}
              className="absolute"
              style={{ top: diagramLayout.httpMessageTops[step - 1] }}
              ref={(el) => {
                httpMessageRefs.current[step - 1] = el;
              }}
            >
              <HttpArrow
                sequenceNumber={step}
                {...props}
                containerWidth={diagramLayout.messageBlockWidth}
                startX={diagramLayout.laneCenters[from]}
                endX={diagramLayout.laneCenters[to]}
                onClick={onArrowClick}
                isActive={activeSectionId === `http-${step}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Insert <wbr> before and after each dot so the browser prefers to break at dot boundaries.
function breakAtDots(text: string) {
  return text
    .split(".")
    .flatMap((val, i) =>
      i === 0 ? [val] : [<wbr key={`before-${i}`} />, ".", <wbr key={`after-${i}`} />, val],
    );
}
