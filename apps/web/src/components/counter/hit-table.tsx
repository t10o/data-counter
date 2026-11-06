import type { Hit, MachineConfig } from "@data-counter/core";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatInteger, formatSigned, formatTime } from "../../lib/format";
import { hasArtGames, kindShape } from "../../lib/machine";
import { KindMark } from "../ui/kind-mark";

interface HitTableProps {
  sessionId: number;
  hits: readonly Hit[];
  machine: MachineConfig | undefined;
  /** 外側の大きさの指定。高さを決めると、その中で縦にスクロールする */
  className?: string;
}

/** 当たり履歴。新しいものが上 */
export function HitTable({ sessionId, hits, machine, className }: HitTableProps) {
  if (hits.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-zinc-500">まだ当たりはありません</p>;
  }
  const artGames = hasArtGames(machine);

  return (
    <div className={cn("overflow-auto", className)}>
      <table className="w-full text-sm whitespace-nowrap tabular-nums">
        {/* 縦にスクロールしても見出しが見えるよう、上に貼り付ける */}
        <thead className="sticky top-0 z-10 bg-zinc-900 text-xs text-zinc-500 shadow-[inset_0_-1px_0_rgb(255_255_255/0.05)]">
          <tr>
            <th className="py-2 pr-3 pl-5 text-right font-medium">回</th>
            <th className="px-3 py-2 text-left font-medium">種別</th>
            <th className="px-3 py-2 text-right font-medium">{artGames ? "ボナ・ART間" : "ゲーム数"}</th>
            {artGames && <th className="px-3 py-2 text-right font-medium">ボナ間</th>}
            <th className="px-3 py-2 text-right font-medium">総回転</th>
            <th className="px-3 py-2 text-right font-medium">獲得</th>
            <th className="px-3 py-2 text-right font-medium">当選時の差枚</th>
            <th className="px-3 py-2 text-right font-medium">時刻</th>
            <th className="py-2 pr-5 pl-3">
              <span className="sr-only">答え合わせ</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {hits.toReversed().map((hit) => (
            <tr key={hit.index} className="group border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
              <td className="py-2.5 pr-3 pl-5 text-right text-zinc-500">{hit.index}</td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2 font-medium text-zinc-100">
                  <KindMark color={hit.color} shape={kindShape(machine, hit.kindId)} />
                  {hit.label}
                  {hit.endedAtUs === null && <span className="text-xs font-normal text-zinc-400">継続中</span>}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-zinc-50">
                {formatInteger(artGames ? hit.gamesAny : hit.games)}
              </td>
              {artGames && <td className="px-3 py-2.5 text-right text-zinc-300">{formatInteger(hit.games)}</td>}
              <td className="px-3 py-2.5 text-right text-zinc-300">{formatInteger(hit.totalGames)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-300">
                {/* パルスで 1 回だけ出る信号は ON の間にゲームが進まないので、獲得枚数はわからない */}
                {hit.gamesDuring > 0 ? formatInteger(hit.out) : "—"}
              </td>
              <td className="px-3 py-2.5 text-right text-zinc-300">{formatSigned(hit.diff)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-400">{formatTime(hit.startedAtUs)}</td>
              <td className="py-1 pr-5 pl-3 text-right">
                <Link
                  to="/sessions/$sessionId/hits/$hitIndex"
                  params={{ sessionId, hitIndex: hit.index }}
                  className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                >
                  答え合わせ
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
