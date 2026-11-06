import type { StoredEdgeEvent } from "@data-counter/core";
import { type PointerEvent, useMemo, useState } from "react";
import { useElementSize } from "../../hooks/use-element-size";
import { formatOffset } from "../../lib/format";
import { onIntervals } from "../../lib/pulses";
import { niceTicks } from "../../lib/scale";

export interface TimelineLane {
  pin: number;
  label: string;
  /** ON の区間を塗る色 */
  color: string;
}

export interface TimelineMarker {
  atUs: number;
  label: string;
}

interface EdgeTimelineProps {
  events: readonly StoredEdgeEvent[];
  lanes: readonly TimelineLane[];
  fromUs: number;
  toUs: number;
  /** 目盛りの 0 にする時刻（当選した瞬間など） */
  originUs: number;
  markers?: readonly TimelineMarker[];
}

const LABEL_WIDTH = 96;
const RIGHT = 16;
const TOP = 24;
const LANE_HEIGHT = 40;
const PULSE_HEIGHT = 22;
const AXIS_HEIGHT = 28;
const NO_MARKERS: readonly TimelineMarker[] = [];

/** ピンごとに ON の区間を並べたタイミングチャート。チャタリング除去前の生イベントをそのまま描く */
export function EdgeTimeline({ events, lanes, fromUs, toUs, originUs, markers = NO_MARKERS }: EdgeTimelineProps) {
  const [containerRef, { width }] = useElementSize<HTMLDivElement>();
  const [hoverUs, setHoverUs] = useState<number | null>(null);

  const height = TOP + lanes.length * LANE_HEIGHT + AXIS_HEIGHT;
  const plotWidth = Math.max(1, width - LABEL_WIDTH - RIGHT);
  const x = (atUs: number) => LABEL_WIDTH + ((atUs - fromUs) / (toUs - fromUs)) * plotWidth;

  const intervals = useMemo(
    () => lanes.map((lane) => onIntervals(events, lane.pin, fromUs, toUs)),
    [events, lanes, fromUs, toUs],
  );
  const ticks = niceTicks((fromUs - originUs) / 1e6, (toUs - originUs) / 1e6, Math.max(2, Math.round(plotWidth / 90)))
    .map((seconds) => originUs + seconds * 1e6)
    .filter((atUs) => atUs >= fromUs && atUs <= toUs);

  const handlePointer = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverUs(fromUs + ((event.clientX - rect.left) / rect.width) * (toUs - fromUs));
  };

  return (
    <div ref={containerRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="端子の ON / OFF のタイミングチャート"
          className="block select-none"
        >
          {lanes.map((lane, i) => {
            const top = TOP + i * LANE_HEIGHT;
            const bottom = top + (LANE_HEIGHT + PULSE_HEIGHT) / 2;
            return (
              <g key={lane.pin}>
                <text x={0} y={bottom - PULSE_HEIGHT / 2} dy="0.32em" className="fill-zinc-400 text-xs">
                  {lane.label}
                </text>
                <line
                  x1={LABEL_WIDTH}
                  x2={width - RIGHT}
                  y1={bottom}
                  y2={bottom}
                  stroke="var(--color-chart-grid)"
                  shapeRendering="crispEdges"
                />
                {intervals[i]?.map(([startUs, endUs]) => (
                  <rect
                    key={startUs}
                    x={x(startUs)}
                    y={bottom - PULSE_HEIGHT}
                    // 数十ミリ秒のパルスでも見えるよう、最低 1px は塗る
                    width={Math.max(1, x(endUs) - x(startUs))}
                    height={PULSE_HEIGHT}
                    rx={1}
                    fill={lane.color}
                  />
                ))}
              </g>
            );
          })}

          {ticks.map((atUs) => (
            <text
              key={atUs}
              x={x(atUs)}
              y={height - 8}
              textAnchor="middle"
              className="fill-zinc-500 text-[11px] tabular-nums"
            >
              {atUs === originUs ? "0" : `${atUs > originUs ? "+" : "−"}${Math.abs((atUs - originUs) / 1e6)}s`}
            </text>
          ))}

          {markers.map((marker) => (
            <g key={marker.label}>
              <line
                x1={x(marker.atUs)}
                x2={x(marker.atUs)}
                y1={TOP - 8}
                y2={height - AXIS_HEIGHT}
                stroke="var(--color-chart-baseline)"
                shapeRendering="crispEdges"
              />
              <text
                x={x(marker.atUs)}
                y={TOP - 12}
                textAnchor="middle"
                className="fill-zinc-300 text-[11px] font-medium"
              >
                {marker.label}
              </text>
            </g>
          ))}

          {hoverUs !== null && (
            <line
              x1={x(hoverUs)}
              x2={x(hoverUs)}
              y1={TOP}
              y2={height - AXIS_HEIGHT}
              stroke="var(--color-chart-line)"
              strokeOpacity={0.5}
              shapeRendering="crispEdges"
            />
          )}

          <rect
            x={LABEL_WIDTH}
            y={TOP}
            width={plotWidth}
            height={lanes.length * LANE_HEIGHT}
            fill="transparent"
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onPointerLeave={() => setHoverUs(null)}
          />
        </svg>
      )}

      {hoverUs !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-zinc-800/95 px-3 py-2 text-xs shadow-lg ring-1 ring-white/10"
          style={{ left: Math.min(width - 80, Math.max(LABEL_WIDTH + 40, x(hoverUs))) }}
        >
          <p className="font-semibold text-zinc-50 tabular-nums">{formatOffset(hoverUs - originUs)}</p>
          <ul className="mt-1 grid gap-0.5">
            {lanes.map((lane, i) => {
              const on = intervals[i]?.some(([startUs, endUs]) => startUs <= hoverUs && hoverUs < endUs) ?? false;
              return (
                <li key={lane.pin} className="flex items-center justify-between gap-4 text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-3 rounded-full"
                      style={{ backgroundColor: lane.color }}
                      aria-hidden="true"
                    />
                    {lane.label}
                  </span>
                  <span className={on ? "font-semibold text-zinc-50" : ""}>{on ? "ON" : "OFF"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
