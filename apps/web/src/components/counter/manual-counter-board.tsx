import type { MachineCounter, SessionDetail } from "@data-counter/core";
import { Plus } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatInteger, formatProbability } from "../../lib/format";
import { useManualCount } from "../../lib/queries";

interface ManualCounterBoardProps {
  session: SessionDetail;
  /** 機種設定の counters */
  counters: readonly MachineCounter[];
}

/**
 * 端子からは取れないもの（リーチ目など）を、タイルを押して数える。数えた回数は実戦ごとに残る。
 * 数えられるのは進行中の実戦だけで、終わった実戦は見るだけ
 */
export function ManualCounterBoard({ session, counters }: ManualCounterBoardProps) {
  const manualCount = useManualCount(session.id);
  const countable = session.endedAtUs === null;
  // マイスロの小役確率と同じく、ボーナス中のゲーム数は分母に入れない
  const { nonBonusGames } = session.snapshot;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className={cn("grid flex-1 auto-rows-fr gap-3", columns(counters.length))}>
        {counters.map(({ id, label }, index) => {
          const count = session.manualCounts[id] ?? 0;
          return (
            <CounterTile
              key={id}
              className={tileSpan(index, counters.length)}
              label={label}
              count={count}
              // 実戦を始めたばかりで 0G のうちは、確率を出さない（1/0.0 になる）
              probability={formatProbability(count === 0 || nonBonusGames === 0 ? null : nonBonusGames / count)}
              onCount={countable ? (step) => manualCount.mutate({ counterId: id, step }) : undefined}
            />
          );
        })}
      </div>

      {manualCount.error ? (
        <p role="alert" className="text-sm text-rose-400">
          数えられませんでした：{manualCount.error.message}
        </p>
      ) : (
        <p className="text-sm text-zinc-400">
          {countable ? "押すと 1 回数えます。押し間違えたら −1 で取り消せます。" : "終わった実戦なので、見るだけです。"}
          確率は、ボーナス中を除いた {formatInteger(nonBonusGames)}G から出しています。
        </p>
      )}
    </div>
  );
}

/**
 * 3 つまでは、縦長の画面では縦に積んで横に広いボタンにし、横長の画面では横に並べる。
 * 4 つは向きにかかわらず 2 × 2。5 つ以上は縦長の画面で 2 列、横長の画面で 3 列（6 分割の 2 つ分ずつ）にする
 */
function columns(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 landscape:grid-cols-2";
  if (count === 3) return "grid-cols-1 landscape:grid-cols-3";
  if (count === 4) return "grid-cols-2";
  return "grid-cols-2 landscape:grid-cols-6";
}

/**
 * 5 つ以上のときのタイルの横幅。最後の行が埋まらないときは、最後の行のタイルを広げて隙間をなくす
 * （縦長の 2 列なら最後の 1 枚を 2 列分に、横長の 3 列なら最後の行の 1〜2 枚で行を埋める）
 */
function tileSpan(index: number, count: number): string | undefined {
  if (count <= 4) return undefined;
  const rest = count % 3;
  const inLastRow = rest > 0 && index >= count - rest;
  return cn(
    count % 2 === 1 && index === count - 1 && "col-span-2",
    !inLastRow ? "landscape:col-span-2" : rest === 1 ? "landscape:col-span-6" : "landscape:col-span-3",
  );
}

interface CounterTileProps {
  className?: string | undefined;
  label: string;
  count: number;
  probability: string;
  /** 省略すると押せない（終わった実戦） */
  onCount?: ((step: 1 | -1) => void) | undefined;
}

function CounterTile({ className, label, count, probability, onCount }: CounterTileProps) {
  const body = (
    <>
      <span className="text-sm font-medium text-zinc-400 lg:text-base">{label}</span>
      <span className="flex flex-1 items-center">
        {/* 数が変わるたびに作り直して、はねる動きを出す */}
        <span
          key={count}
          className="text-[clamp(2.25rem,min(22cqi,40cqb),9rem)] leading-none font-semibold tracking-tight text-zinc-50 tabular-nums motion-safe:animate-count-pop"
        >
          {formatInteger(count)}
        </span>
      </span>
      <span className="text-sm text-zinc-400 tabular-nums lg:text-base">{probability}</span>
    </>
  );

  return (
    // タイルの大きさを数字の大きさの基準にする（cqi / cqb）
    <div
      className={cn("[container-type:size] relative min-h-28 rounded-2xl bg-zinc-900 ring-1 ring-white/10", className)}
    >
      {onCount ? (
        <>
          {/* 台を見ながら押せるよう、タイル全体をボタンにする。連打で拡大されないよう touch-manipulation */}
          <button
            type="button"
            aria-label={`${label}を 1 回数える（いま ${formatInteger(count)} 回）`}
            onClick={() => onCount(1)}
            className="flex size-full touch-manipulation flex-col items-start rounded-2xl px-5 py-4 text-left transition select-none active:scale-[0.98] active:bg-white/5"
          >
            {body}
            <Plus className="absolute right-4 bottom-4 size-8 text-zinc-600" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`${label}の最後の 1 回を取り消す`}
            disabled={count === 0}
            onClick={() => onCount(-1)}
            className="absolute top-3 right-3 h-10 min-w-12 touch-manipulation rounded-lg bg-white/5 px-3 text-sm font-medium text-zinc-300 ring-1 ring-white/10 transition-colors select-none hover:bg-white/10 disabled:opacity-30"
          >
            −1
          </button>
        </>
      ) : (
        <div className="flex size-full flex-col px-5 py-4">{body}</div>
      )}
    </div>
  );
}
