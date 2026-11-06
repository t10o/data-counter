import type { Hit, MachineConfig, SlumpPoint } from "@data-counter/core";
import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import { cn } from "../../lib/cn";
import { formatInteger, formatSigned } from "../../lib/format";
import { hasArtGames, KIND_COLORS, kindShape } from "../../lib/machine";
import { nearestIndex, niceTicks } from "../../lib/scale";
import { KindMark, MarkerShapePath } from "../ui/kind-mark";

const MARGIN = { top: 16, right: 64, bottom: 28, left: 60 };
const SURFACE = "var(--color-chart-surface)";
const LINE = "var(--color-chart-line)";
/** 始めたばかりでもグラフがつぶれないよう、軸はこれ以上の幅を必ずとる */
const MIN_GAMES = 100;
const MIN_DIFF_SPAN = 200;
/** 十字線からこの距離（px）以内の当たりは、ツールチップにも出す */
const HIT_SNAP_PX = 6;

interface SlumpChartProps {
  points: readonly SlumpPoint[];
  hits: readonly Hit[];
  machine: MachineConfig | undefined;
  /** 高さ（px）。fill のときは使わない */
  height?: number;
  /** 位置を決めた親（relative）いっぱいに広げる */
  fill?: boolean;
}

/** 横軸がゲーム数、縦軸が差枚のスランプグラフ。当たった位置に種別ごとの印を打つ */
export function SlumpChart({ points, hits, machine, height: fixedHeight = 300, fill = false }: SlumpChartProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const { width } = size;
  const height = fill ? size.height : fixedHeight;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const layout = useMemo(() => buildLayout(points, hits, width, height), [points, hits, width, height]);
  const { x, y, xMax, xTicks, yTicks } = layout;

  const last = points.at(-1);
  const hovered = hoverIndex === null ? undefined : points[hoverIndex];
  const focused = hovered ?? last;
  const hoveredHits =
    hovered === undefined ? [] : hits.filter((hit) => Math.abs(x(hit.totalGames) - x(hovered[0])) <= HIT_SNAP_PX);

  const moveTo = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverIndex(nearestIndex(layout.games, ((event.clientX - rect.left) / rect.width) * xMax));
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const lastIndex = points.length - 1;
    const current = hoverIndex ?? lastIndex;
    const step = event.shiftKey ? 50 : 1;
    const targets: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowRight: current + step,
      Home: 0,
      End: lastIndex,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setHoverIndex(Math.min(lastIndex, Math.max(0, next)));
  };

  return (
    <div ref={containerRef} className={cn(fill ? "absolute inset-0" : "relative")}>
      {width > 0 && height > 0 && (
        // 十字線を左右キーで動かせるので、読み上げではスライダーとして扱う
        <svg
          width={width}
          height={height}
          role="slider"
          aria-label="スランプグラフ"
          aria-valuemin={0}
          aria-valuemax={last?.[0] ?? 0}
          aria-valuenow={focused?.[0] ?? 0}
          aria-valuetext={
            focused ? `${formatInteger(focused[0])} ゲーム、差枚 ${formatSigned(focused[1])} 枚` : "データなし"
          }
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onBlur={() => setHoverIndex(null)}
          className="block touch-pan-y select-none focus-visible:outline-none"
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--color-chart-baseline)" : "var(--color-chart-grid)"}
                shapeRendering="crispEdges"
              />
              <text
                x={MARGIN.left - 10}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-zinc-500 text-[11px] tabular-nums"
              >
                {formatSigned(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={height - 8}
              textAnchor="middle"
              className="fill-zinc-500 text-[11px] tabular-nums"
            >
              {tick === 0 ? "0" : `${formatInteger(tick)}G`}
            </text>
          ))}

          <path d={layout.area} fill={LINE} fillOpacity={0.08} />
          <path
            d={layout.line}
            fill="none"
            stroke={LINE}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hits.map((hit) => (
            <MarkerShapePath
              key={hit.index}
              shape={kindShape(machine, hit.kindId)}
              x={x(hit.totalGames)}
              y={y(hit.diff)}
              radius={4.5}
              fill={KIND_COLORS[hit.color]}
              stroke={SURFACE}
              strokeWidth={2}
            />
          ))}

          {last && (
            <>
              <circle cx={x(last[0])} cy={y(last[1])} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />
              <text
                x={x(last[0]) + 10}
                y={y(last[1])}
                dy="0.32em"
                className="fill-zinc-200 text-xs font-semibold tabular-nums"
              >
                {formatSigned(last[1])}
              </text>
            </>
          )}

          {hovered && (
            <>
              <line
                x1={x(hovered[0])}
                x2={x(hovered[0])}
                y1={MARGIN.top}
                y2={height - MARGIN.bottom}
                stroke="var(--color-chart-baseline)"
                shapeRendering="crispEdges"
              />
              <circle cx={x(hovered[0])} cy={y(hovered[1])} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />
            </>
          )}

          {/* ポインターの受け口。線の上を狙わなくても、横位置だけで一番近い点を拾う */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={layout.plotWidth}
            height={layout.plotHeight}
            fill="transparent"
            onPointerDown={moveTo}
            onPointerMove={moveTo}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>
      )}

      {points.length <= 1 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-500">
          まだ回していません
        </p>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-28 -translate-x-1/2 rounded-lg bg-zinc-800/95 px-3 py-2 text-xs shadow-lg ring-1 ring-white/10 backdrop-blur"
          style={{ left: Math.min(width - 72, Math.max(72, x(hovered[0]))) }}
        >
          <p className="text-base font-semibold text-zinc-50 tabular-nums">{formatSigned(hovered[1])} 枚</p>
          <p className="text-zinc-400 tabular-nums">{formatInteger(hovered[0])} G</p>
          {hoveredHits.map((hit) => (
            <p key={hit.index} className="mt-1 flex items-center gap-1.5 text-zinc-300">
              <KindMark color={hit.color} shape={kindShape(machine, hit.kindId)} />
              {hit.label}（{formatInteger(hasArtGames(machine) ? hit.gamesAny : hit.games)} G）
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** グラフの右上に置く凡例。線は 1 本なので、当たりの印の種別だけを並べる */
export function SlumpLegend({ machine }: { machine: MachineConfig | undefined }) {
  const kinds = machine?.signals.flatMap((signal) => signal.kinds) ?? [];
  if (kinds.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
      {kinds.map((kind) => (
        <li key={kind.id} className="flex items-center gap-1.5">
          <KindMark color={kind.color} shape={kindShape(machine, kind.id)} />
          {kind.label}
        </li>
      ))}
    </ul>
  );
}

function buildLayout(points: readonly SlumpPoint[], hits: readonly Hit[], width: number, height: number) {
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);

  const lastGames = points.at(-1)?.[0] ?? 0;
  const xTicks = niceTicks(0, Math.max(lastGames, MIN_GAMES), Math.max(2, Math.round(plotWidth / 110)));
  const xMax = xTicks.at(-1) ?? MIN_GAMES;

  let low = 0;
  let high = 0;
  for (const [, diff] of points) {
    low = Math.min(low, diff);
    high = Math.max(high, diff);
  }
  for (const hit of hits) {
    low = Math.min(low, hit.diff);
    high = Math.max(high, hit.diff);
  }
  const padding = Math.max(0, MIN_DIFF_SPAN - (high - low)) / 2;
  const yTicks = niceTicks(low - padding, high + padding, Math.max(3, Math.round(plotHeight / 56)));
  const yMin = yTicks[0] ?? low;
  const yMax = yTicks.at(-1) ?? high;

  const x = (games: number) => MARGIN.left + (games / xMax) * plotWidth;
  const y = (diff: number) => MARGIN.top + ((yMax - diff) / (yMax - yMin)) * plotHeight;

  const line = points
    .map(([games, diff], i) => `${i === 0 ? "M" : "L"}${x(games).toFixed(1)},${y(diff).toFixed(1)}`)
    .join("");
  const first = points[0];
  const last = points.at(-1);
  const area = first && last ? `${line}L${x(last[0]).toFixed(1)},${y(0)}L${x(first[0]).toFixed(1)},${y(0)}Z` : "";

  return { plotWidth, plotHeight, x, y, xMax, xTicks, yTicks, line, area, games: points.map(([games]) => games) };
}
