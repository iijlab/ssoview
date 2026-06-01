/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary } from "@/common/models/session-summary.ts";
import { type SamlSectionId } from "@/report-page/common/types.ts";

type SamlArrowProps = {
  sessionSummary: SessionSummary;
  sectionId: SamlSectionId;
  containerWidth: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  turnX: number;
  onClick?: (sectionId: SamlSectionId) => void;
  isActive: boolean;
};

export function SamlArrow({
  sessionSummary,
  sectionId,
  containerWidth,
  startX,
  startY,
  endX,
  endY,
  turnX,
  onClick,
  isActive,
}: SamlArrowProps) {
  const lineWidth = 12;
  const arrowheadWidth = 24;
  const arrowheadHeight = 32;
  const outR = lineWidth + 8;
  const inR = outR - lineWidth;
  const marginLeft = 12;
  const marginTop = -4;

  const arrowheadSideOverhangWidth = (arrowheadWidth - lineWidth) / 2;
  const containerHeight = endY + marginTop + lineWidth + arrowheadSideOverhangWidth;
  const outLeft = turnX - marginLeft - lineWidth;
  const inLeft = turnX - marginLeft;
  const outTop = startY + marginTop;
  const inTop = startY + marginTop + lineWidth;
  const outBottom = endY + marginTop + lineWidth;
  const inBottom = endY + marginTop;

  const arrowColorClass = isActive
    ? "fill-amber-500 stroke-amber-800"
    : sectionId === "saml-response" && sessionSummary.status === "failed"
      ? "fill-red-500 stroke-rose-800 hover:fill-rose-400"
      : "fill-purple-500 stroke-purple-800 hover:fill-purple-400";

  return (
    <div
      className="relative pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      <svg
        width="100%"
        height={containerHeight}
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
      >
        <path
          d={`
          M ${startX} ${outTop}
          L ${outLeft + outR} ${outTop}
          Q ${outLeft} ${outTop} ${outLeft} ${outTop + outR}
          L ${outLeft} ${outBottom - outR}
          Q ${outLeft} ${outBottom} ${outLeft + outR} ${outBottom}
          L ${endX - arrowheadHeight} ${outBottom}
          L ${endX - arrowheadHeight} ${outBottom + arrowheadSideOverhangWidth}
          L ${endX} ${(outBottom + inBottom) / 2}
          L ${endX - arrowheadHeight} ${inBottom - arrowheadSideOverhangWidth}
          L ${endX - arrowheadHeight} ${inBottom}
          L ${inLeft + inR} ${inBottom}
          Q ${inLeft} ${inBottom} ${inLeft} ${inBottom - inR}
          L ${inLeft} ${inTop + inR}
          Q ${inLeft} ${inTop} ${inLeft + inR} ${inTop}
          L ${startX} ${inTop}
          Z
        `}
          className={`cursor-pointer pointer-events-auto ${arrowColorClass}`}
          strokeWidth={isActive ? 3 : 2}
          onClick={() => onClick?.(sectionId)}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="px-4 py-1 bg-purple-600 text-white font-bold rounded-lg">
          {sectionId === "saml-request" ? "SAML AuthnRequest" : "SAML Response"}
        </div>
      </div>
    </div>
  );
}
