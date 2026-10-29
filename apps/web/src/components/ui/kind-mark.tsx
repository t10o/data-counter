import type { KindColor } from "@data-counter/core";
import { KIND_COLORS, type MarkerShape } from "../../lib/machine";

interface KindMarkProps {
  color: KindColor;
  shape?: MarkerShape;
  size?: number;
}

/** 種別を表す小さな印。文字には色を付けず、横にこれを添える */
export function KindMark({ color, shape = "circle", size = 10 }: KindMarkProps) {
  return (
    <svg width={size} height={size} viewBox="-6 -6 12 12" aria-hidden="true" className="shrink-0">
      <MarkerShapePath shape={shape} fill={KIND_COLORS[color]} radius={5} />
    </svg>
  );
}

interface MarkerShapePathProps {
  shape: MarkerShape;
  fill: string;
  radius: number;
  x?: number;
  y?: number;
  stroke?: string;
  strokeWidth?: number;
}

/** (x, y) を中心にした印。グラフの当たりの印と凡例で同じ形を使う */
export function MarkerShapePath({ shape, fill, radius: r, x = 0, y = 0, stroke, strokeWidth }: MarkerShapePathProps) {
  const paint = { fill, stroke, strokeWidth, strokeLinejoin: "round" as const };
  switch (shape) {
    case "square": {
      const side = r * 1.7;
      return <rect x={x - side / 2} y={y - side / 2} width={side} height={side} rx={1.5} {...paint} />;
    }
    case "diamond": {
      const d = r * 1.25;
      return <path d={`M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z`} {...paint} />;
    }
    case "triangle": {
      const d = r * 1.2;
      return <path d={`M${x} ${y - d}L${x + d} ${y + d * 0.8}L${x - d} ${y + d * 0.8}Z`} {...paint} />;
    }
    case "circle":
      return <circle cx={x} cy={y} r={r} {...paint} />;
  }
}
