/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type RefObject } from "react";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { type ContentSectionId } from "@/report-page/common/types.ts";
import { HttpDetails } from "./http-details.tsx";
import { SamlDetails } from "./saml-details.tsx";
import { SessionOverview } from "./session-overview.tsx";

type ContentProps = {
  httpMessageRecord: Record<number, HttpMessage>;
  sessionSummary: SessionSummary;
  authnRequestXml?: string;
  responseXml?: string;
  sectionRefs: RefObject<Partial<Record<ContentSectionId, HTMLElement | null>>>;
};

export function Content({
  httpMessageRecord,
  sessionSummary,
  authnRequestXml,
  responseXml,
  sectionRefs,
}: ContentProps) {
  const setSectionRef = (sectionId: ContentSectionId) => {
    return (el: HTMLElement | null) => {
      if (el) {
        sectionRefs.current[sectionId] = el;
      }
    };
  };

  return (
    <div className="mx-4 mt-6 mb-4 space-y-8">
      <section ref={setSectionRef("session-summary")}>
        <SessionOverview
          sessionSummary={sessionSummary}
          authnRequestXml={authnRequestXml}
          responseXml={responseXml}
        />
      </section>
      {authnRequestXml && (
        <section ref={setSectionRef("saml-request")}>
          <SamlDetails kind="request" rawXml={authnRequestXml} />
        </section>
      )}
      {responseXml && (
        <section ref={setSectionRef("saml-response")}>
          <SamlDetails kind="response" rawXml={responseXml} />
        </section>
      )}
      {Object.entries(httpMessageRecord).map(([stepStr, httpMessage]) => {
        const step = Number(stepStr);
        return (
          <section
            key={`${httpMessage.requestId}-${httpMessage.stage}`}
            ref={setSectionRef(`http-${step}`)}
          >
            <HttpDetails httpMessage={httpMessage} sequenceNumber={step} />
          </section>
        );
      })}
    </div>
  );
}
