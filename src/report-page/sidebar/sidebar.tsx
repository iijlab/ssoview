/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { type ArrowClickHandler, type ContentSectionId } from "@/report-page/common/types.ts";
import { LogoHeader } from "./logo-header.tsx";
import { SequenceDiagram } from "./sequence-diagram.tsx";

type SidebarProps = {
  httpMessageRecord: Record<number, HttpMessage>;
  sessionSummary: SessionSummary;
  activeSectionId: ContentSectionId;
  onLogoClick: () => void;
  onArrowClick: ArrowClickHandler;
};

export function Sidebar({
  httpMessageRecord,
  sessionSummary,
  activeSectionId,
  onLogoClick,
  onArrowClick,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mx-4 mt-4">
        <LogoHeader onClick={onLogoClick} />
      </div>
      {/* Must use padding (not margin) on the left, right, and bottom for the sequence diagram overlay */}
      <div className="flex-1 overflow-y-auto mt-4 px-4 pb-4">
        <SequenceDiagram
          httpMessageRecord={httpMessageRecord}
          sessionSummary={sessionSummary}
          activeSectionId={activeSectionId}
          onArrowClick={onArrowClick}
        />
      </div>
    </div>
  );
}
