import type { StoredEdgeEvent } from "@data-counter/core";

export interface TimedEdge extends StoredEdgeEvent {
  /** 同じピンの 1 つ前の変化からの時間。rise なら ON だった時間、fall なら OFF だった時間 */
  sincePreviousUs: number | null;
}

/** 生イベントに、同じピンの直前の変化からの時間を付ける（パルス幅の確認用） */
export function withIntervals(events: readonly StoredEdgeEvent[]): TimedEdge[] {
  const previous = new Map<string, StoredEdgeEvent>();
  return events.map((event) => {
    // Pico が再起動すると時計が 0 に戻るので、起動ごとに分けて測る
    const key = `${event.bootId}:${event.pin}`;
    const before = previous.get(key);
    previous.set(key, event);
    return { ...event, sincePreviousUs: before ? event.tUs - before.tUs : null };
  });
}

export interface PulseStats {
  pin: number;
  count: number;
  minUs: number;
  maxUs: number;
  meanUs: number;
}

/** ピンごとの ON パルス（fall から rise まで）の幅 */
export function pulseStats(events: readonly StoredEdgeEvent[]): PulseStats[] {
  const widths = new Map<number, number[]>();
  for (const edge of withIntervals(events)) {
    if (edge.edge !== "rise" || edge.sincePreviousUs === null) continue;
    const list = widths.get(edge.pin) ?? [];
    list.push(edge.sincePreviousUs);
    widths.set(edge.pin, list);
  }

  return [...widths]
    .map(([pin, list]) => ({
      pin,
      count: list.length,
      minUs: Math.min(...list),
      maxUs: Math.max(...list),
      meanUs: list.reduce((sum, width) => sum + width, 0) / list.length,
    }))
    .toSorted((a, b) => a.pin - b.pin);
}

/** ON（接点が閉じていた）区間。範囲の外から ON だったときは範囲の端で切る */
export function onIntervals(
  events: readonly StoredEdgeEvent[],
  pin: number,
  fromUs: number,
  toUs: number,
): [startUs: number, endUs: number][] {
  const intervals: [number, number][] = [];
  let onSince: number | null = null;
  let seenAny = false;

  for (const event of events) {
    if (event.pin !== pin) continue;
    if (event.edge === "fall") {
      onSince ??= event.atUs;
    } else {
      if (onSince !== null) intervals.push([onSince, event.atUs]);
      else if (!seenAny) intervals.push([fromUs, event.atUs]);
      onSince = null;
    }
    seenAny = true;
  }
  if (onSince !== null) intervals.push([onSince, toUs]);
  return intervals;
}
