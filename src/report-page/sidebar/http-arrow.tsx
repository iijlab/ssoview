/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpSectionId } from "@/report-page/common/types.ts";

type HttpArrowProps = {
  sequenceNumber: number;
  timestamp: string;
  description: string;
  statusCode?: number;
  containerWidth: number;
  startX: number;
  endX: number;
  onClick?: (sectionId: HttpSectionId) => void;
  isActive: boolean;
};

export function HttpArrow({
  sequenceNumber,
  timestamp,
  description,
  statusCode,
  containerWidth,
  startX,
  endX,
  onClick,
  isActive,
}: HttpArrowProps) {
  const lineWidth = 12;
  const arrowheadWidth = 24;
  const arrowheadHeight = 32;

  const isRight = startX < endX;
  const lineTop = (arrowheadWidth - lineWidth) / 2;
  const lineBottom = lineTop + lineWidth;
  const arrowheadStartX = endX - (isRight ? arrowheadHeight : -arrowheadHeight);

  const arrowColorClass = isActive
    ? "fill-amber-500 stroke-amber-800"
    : statusCode !== undefined && 400 <= statusCode
      ? "fill-red-500 stroke-rose-800 hover:fill-rose-400"
      : isRight
        ? "fill-sky-500 stroke-sky-800 hover:fill-sky-400"
        : "fill-lime-500 stroke-lime-800 hover:fill-lime-400";

  return (
    <div className="flex flex-col gap-1 pointer-events-none" style={{ width: containerWidth }}>
      <div className="flex items-center gap-3" style={{ marginLeft: isRight ? startX : endX }}>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900 text-xs font-semibold text-white border-2 border-blue-400">
          {sequenceNumber}
        </div>
        <div className="flex flex-col gap-1 min-w-0 mr-4">
          <div className="text-xs text-gray-400">{timestamp}</div>
          <div className="text-xs truncate">{description}</div>
        </div>
      </div>

      <svg width="100%" height={arrowheadWidth} viewBox={`0 0 ${containerWidth} ${arrowheadWidth}`}>
        <path
          d={`
          M ${startX} ${lineTop}
          L ${arrowheadStartX} ${lineTop}
          L ${arrowheadStartX} 0
          L ${endX} ${arrowheadWidth / 2}
          L ${arrowheadStartX} ${arrowheadWidth}
          L ${arrowheadStartX} ${lineBottom}
          L ${startX} ${lineBottom}
          Z
        `}
          className={`cursor-pointer pointer-events-auto ${arrowColorClass}`}
          strokeWidth={isActive ? 3 : 2}
          onClick={() => onClick?.(`http-${sequenceNumber}`)}
        />
      </svg>
    </div>
  );
}
