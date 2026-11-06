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
  const artGames = hasArtGames(machine);
  const hamari = artGames
    ? [
        { label: "ボナ・ART間", current: summary.currentGamesAny, max: summary.maxGamesAny },
        { label: "ボナ間", current: summary.currentGames, max: summary.maxGames },
      ]
    : [{ label: "現在", current: summary.currentGames, max: summary.maxGames }];

  // 合算は、足し合わせる種別のすぐ後ろに置く。ボナ合算（BIG + REG）はボーナスの種別の後ろ、
  // ボナ+ART合算は最後（ART の種別の後ろ）。足すものが 1 種類だけなら、その種別のタイルと同じ数になるので出さない
  const bonusKindIds = new Set(
    machine?.signals.filter((signal) => signal.resetsGames).flatMap((signal) => signal.kinds.map((kind) => kind.id)),
  );
  const bonusKindCount = summary.kinds.filter((kind) => bonusKindIds.has(kind.id)).length;
  const lastBonusIndex = summary.kinds.findLastIndex((kind) => bonusKindIds.has(kind.id));
  const bonusTotal: TileItem = {
    key: "bonus-total",
    label: artGames ? "ボナ合算" : "合算",
    value: formatInteger(summary.hitCount),
    detail: formatProbability(summary.hitProbability),
  };
  const anyTotal: TileItem = {
    key: "any-total",
    label: "ボナ+ART合算",
    value: formatInteger(summary.hitCountAny),
    detail: formatProbability(summary.hitProbabilityAny),
  };
  const kindTiles = summary.kinds.flatMap((kind, index): TileItem[] => [
    {
      key: kind.id,
      label: (
        <>
          <KindMark color={kind.color} shape={kindShape(machine, kind.id)} />
          {kind.label}
        </>
      ),
      value: formatInteger(kind.count),
      detail: formatProbability(kind.probability),
    },
    ...(index === lastBonusIndex && bonusKindCount >= 2 ? [bonusTotal] : []),
    ...(index === summary.kinds.length - 1 && artGames && bonusKindCount >= 1 ? [anyTotal] : []),
  ]);

  const tiles: TileItem[] = [
    ...kindTiles,
    { key: "total", label: "総回転", value: formatInteger(summary.totalGames) },
    ...hamari.map(({ label, current, max }, index) => ({
      key: label,
      label,
      value: formatInteger(current),
      detail: `最大 ${formatInteger(max)}`,
      badge: index === 0 && active ? `${active.label} 中` : undefined,
      highlight: index === 0 && active !== undefined,
    })),
  ];
  const threeColumns = tiles.length > 4;

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* 残りの高さいっぱいにタイルを敷き詰める。5 枚以上なら、横長の画面では 3 列にする（6 分割の 2 つ分ずつ） */}
      <div className={cn("grid flex-1 auto-rows-fr grid-cols-2 gap-3", threeColumns && "md:landscape:grid-cols-6")}>
        {tiles.map(({ key, ...tile }, index) => (
          <Tile key={key} {...tile} className={tileSpan(index, tiles.length, threeColumns)} />
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

/**
 * タイルの横幅。最後の行が埋まらないときは、最後の行のタイルを広げて隙間をなくす
 * （2 列なら最後の 1 枚を 2 列分に、3 列なら最後の行の 1〜2 枚で行を埋める）
 */
function tileSpan(index: number, count: number, threeColumns: boolean): string {
  const rest = count % 3;
  const inLastRow = rest > 0 && index >= count - rest;
  return cn(
    count % 2 === 1 && index === count - 1 && "col-span-2",
    threeColumns &&
      (!inLastRow ? "md:landscape:col-span-2" : rest === 1 ? "md:landscape:col-span-6" : "md:landscape:col-span-3"),
  );
}

interface TileProps {
  label: ReactNode;
  value: string;
  detail?: string | undefined;
  badge?: string | undefined;
  highlight?: boolean;
  className?: string;
}

interface TileItem extends TileProps {
  key: string;
}

function Tile({ label, value, detail, badge, highlight = false, className }: TileProps) {
  return (
    // タイルの大きさを数字の大きさの基準にする（cqi / cqb）。大きな画面ほど数字も大きくなる
    <div
      className={cn(
        "[container-type:size] relative flex min-h-28 flex-col rounded-2xl bg-zinc-900 px-5 py-4 ring-1 ring-white/10 transition-shadow",
        highlight && "ring-2 ring-zinc-300/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-400 lg:text-base">{label}</p>
        {badge && (
          <span className="animate-pulse rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-900">
            {badge}
          </span>
        )}
      </div>
      {/* ライブで数字が変わっても桁の位置がぶれないよう、ここは等幅の数字にする */}
      <p className="flex flex-1 items-center text-[clamp(2.25rem,min(22cqi,40cqb),9rem)] leading-none font-semibold tracking-tight text-zinc-50 tabular-nums">
        {value}
      </p>
      {detail && <p className="text-sm text-zinc-400 tabular-nums lg:text-base">{detail}</p>}
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
