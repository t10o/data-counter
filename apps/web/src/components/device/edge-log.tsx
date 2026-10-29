import type { MachineConfig, StoredEdgeEvent } from "@data-counter/core";
import { useMemo } from "react";
import { formatInteger, formatMs, formatTimeMs } from "../../lib/format";
import { pinLabel } from "../../lib/machine";
import { pulseStats, withIntervals } from "../../lib/pulses";

interface EdgeLogProps {
  edges: readonly StoredEdgeEvent[];
  machine: MachineConfig | undefined;
}

/** 届いた生イベントの一覧。配線の確認やパルス幅の測定に使う */
export function EdgeLog({ edges, machine }: EdgeLogProps) {
  const rows = useMemo(() => withIntervals(edges).toReversed().slice(0, 200), [edges]);

  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-zinc-500">
        このページを開いてから届いたイベントがここに出ます。メダルを入れてみてください。
      </p>
    );
  }

  return (
    <div className="max-h-[32rem] overflow-auto">
      <table className="w-full font-mono text-xs whitespace-nowrap tabular-nums">
        <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
          <tr className="border-b border-white/5">
            <th className="py-2 pr-3 pl-5 text-left font-medium">時刻</th>
            <th className="px-3 py-2 text-right font-medium">seq</th>
            <th className="px-3 py-2 text-left font-medium">ピン</th>
            <th className="px-3 py-2 text-left font-medium">変化</th>
            <th className="py-2 pr-5 pl-3 text-right font-medium">直前の変化から</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((edge) => (
            <tr key={edge.id} className="border-b border-white/5 last:border-0">
              <td className="py-1.5 pr-3 pl-5 text-zinc-400">{formatTimeMs(edge.atUs)}</td>
              <td className="px-3 py-1.5 text-right text-zinc-500">{edge.seq}</td>
              <td className="px-3 py-1.5 text-zinc-200">
                {edge.pin}番 {pinLabel(edge.pin, machine)}
              </td>
              <td className="px-3 py-1.5">
                {edge.edge === "fall" ? (
                  <span className="text-zinc-50">ON（fall）</span>
                ) : (
                  <span className="text-zinc-400">OFF（rise）</span>
                )}
              </td>
              <td className="py-1.5 pr-5 pl-3 text-right text-zinc-300">
                {edge.sincePreviousUs === null ? "—" : formatMs(edge.sincePreviousUs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ピンごとの ON パルス幅のまとめ。チャタリング除去の時間を決める手がかりにする */
export function PulseSummary({ edges, machine }: EdgeLogProps) {
  const stats = useMemo(() => pulseStats(edges), [edges]);

  if (stats.length === 0) return <p className="px-5 pb-5 text-sm text-zinc-500">まだパルスがありません</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap tabular-nums">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-white/5">
            <th className="py-2 pr-3 pl-5 text-left font-medium">ピン</th>
            <th className="px-3 py-2 text-right font-medium">回数</th>
            <th className="px-3 py-2 text-right font-medium">最短</th>
            <th className="px-3 py-2 text-right font-medium">平均</th>
            <th className="py-2 pr-5 pl-3 text-right font-medium">最長</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((stat) => (
            <tr key={stat.pin} className="border-b border-white/5 last:border-0">
              <td className="py-2 pr-3 pl-5 text-zinc-200">
                {stat.pin}番 {pinLabel(stat.pin, machine)}
              </td>
              <td className="px-3 py-2 text-right text-zinc-300">{formatInteger(stat.count)}</td>
              <td className="px-3 py-2 text-right text-zinc-300">{formatMs(stat.minUs)}</td>
              <td className="px-3 py-2 text-right text-zinc-300">{formatMs(stat.meanUs)}</td>
              <td className="py-2 pr-5 pl-3 text-right text-zinc-300">{formatMs(stat.maxUs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
