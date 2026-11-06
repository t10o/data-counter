import type { CounterSummary, Hit, MachineConfig } from "@data-counter/core";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatInteger, formatPercent, formatProbability, formatSigned } from "../../lib/format";
import { hasArtGames, kindShape } from "../../lib/machine";
import { KindMark } from "../ui/kind-mark";

interface CounterBoardProps {
  summary: CounterSummary;
  machine: MachineConfig | undefined;
  /** 信号が ON になっている当たり（ボーナス中の表示に使う） */
  activeHits: readonly Hit[];
}

/** ホールのデータカウンターの正面にあたる部分 */
export function CounterBoard({ summary, machine, activeHits }: CounterBoardProps) {
  const active = activeHits.at(-1);
  const hamari = hasArtGames(machine)
    ? [
        { label: "ボナ・ART間", current: summary.currentGamesAny, max: summary.maxGamesAny },
        { label: "ボナ間", current: summary.currentGames, max: summary.maxGames },
      ]
    : [{ label: "現在", current: summary.currentGames, max: summary.maxGames }];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {summary.kinds.map((kind) => (
          <Tile
            key={kind.id}
            label={
              <>
                <KindMark color={kind.color} shape={kindShape(machine, kind.id)} />
                {kind.label}
              </>
            }
            value={formatInteger(kind.count)}
            detail={formatProbability(kind.probability)}
          />
        ))}
        <Tile
          label="総回転"
          value={formatInteger(summary.totalGames)}
          detail={`合成 ${formatProbability(summary.hitProbability)}`}
        />
        {hamari.map(({ label, current, max }, index) => (
          <Tile
            key={label}
            label={label}
            value={formatInteger(current)}
            detail={`最大 ${formatInteger(max)}`}
            badge={index === 0 && active ? `${active.label} 中` : undefined}
            highlight={index === 0 && active !== undefined}
          />
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-zinc-900 px-5 py-4 ring-1 ring-white/10 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="差枚" value={formatSigned(summary.diff)} tone={toneOf(summary.diff)} />
        <Stat label="機械割" value={formatPercent(summary.payoutRate)} />
        <Stat label="IN" value={formatInteger(summary.in)} />
        <Stat label="OUT" value={formatInteger(summary.out)} />
        <Stat label="最大差枚" value={formatSigned(summary.maxDiff)} />
        <Stat label="最小差枚" value={formatSigned(summary.minDiff)} />
      </dl>
    </div>
  );
}

interface TileProps {
  label: ReactNode;
  value: string;
  detail: string;
  badge?: string | undefined;
  highlight?: boolean;
}

function Tile({ label, value, detail, badge, highlight = false }: TileProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl bg-zinc-900 px-5 pt-4 pb-5 ring-1 ring-white/10 transition-shadow",
        highlight && "ring-2 ring-zinc-300/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-400">{label}</p>
        {badge && (
          <span className="animate-pulse rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-900">
            {badge}
          </span>
        )}
      </div>
      {/* ライブで数字が変わっても桁の位置がぶれないよう、ここは等幅の数字にする */}
      <p className="mt-2 text-4xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-5xl xl:text-6xl">
        {value}
      </p>
      <p className="mt-1 text-sm text-zinc-400 tabular-nums">{detail}</p>
    </div>
  );
}

type Tone = "neutral" | "up" | "down";

const toneOf = (value: number): Tone => (value > 0 ? "up" : value < 0 ? "down" : "neutral");

const toneClass: Record<Tone, string> = {
  neutral: "text-zinc-50",
  up: "text-emerald-400",
  down: "text-rose-400",
};

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={cn("mt-0.5 text-xl font-semibold tabular-nums", toneClass[tone])}>{value}</dd>
    </div>
  );
}
