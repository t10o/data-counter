import type { MachineConfig, SessionDetail } from "@data-counter/core";
import { Link } from "@tanstack/react-router";
import { ChartLine, Gauge, ListOrdered, Tally5 } from "lucide-react";
import type { ReactNode } from "react";
import { useNowUs } from "../../hooks/use-now";
import { cn } from "../../lib/cn";
import { DASHBOARD_VIEWS, type DashboardView } from "../../lib/dashboard-view";
import { formatDateTime, formatDuration, formatSigned } from "../../lib/format";
import { hasArtGames } from "../../lib/machine";
import { CounterBoard } from "../counter/counter-board";
import { HitTable } from "../counter/hit-table";
import { ManualCounterBoard } from "../counter/manual-counter-board";
import { SlumpChart, SlumpLegend } from "../counter/slump-chart";
import { Card, CardHeader } from "../ui/card";

interface SessionDashboardProps {
  session: SessionDetail;
  machine: MachineConfig | undefined;
  /** 出す画面（データ・グラフ・当たり履歴・手動集計） */
  view: DashboardView;
  /** 見出しの右側に置く操作 */
  actions?: ReactNode;
}

/**
 * 実戦 1 回分のデータ。進行中の実戦にも、終わった実戦にも使う。
 * 画面を切り替えて、どれも 1 画面に収める（収まらない小さな画面ではページごとスクロールする）
 */
export function SessionDashboard({ session, machine, view, actions }: SessionDashboardProps) {
  const { snapshot } = session;
  const activeHits = snapshot.hits.filter((hit) => hit.endedAtUs === null && snapshot.activePins.includes(hit.pin));
  const counters = machine?.counters ?? [];
  // 手動集計は、手で数えるものが設定してある機種だけ
  const views = (Object.keys(DASHBOARD_VIEWS) as DashboardView[]).filter(
    (key) => key !== "count" || counters.length > 0,
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-zinc-50 sm:text-2xl">
            {machine?.name ?? session.machineId}
          </h1>
          <SessionPeriod session={session} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewTabs views={views} view={view} />
          {actions}
        </div>
      </header>

      {view === "data" && <CounterBoard summary={snapshot} machine={machine} activeHits={activeHits} />}

      {view === "graph" && (
        <Card className="flex min-h-80 flex-1 flex-col">
          <CardHeader
            title="スランプグラフ"
            description={`差枚 ${formatSigned(snapshot.diff)}（最大 ${formatSigned(snapshot.maxDiff)}・最小 ${formatSigned(snapshot.minDiff)}）`}
            actions={<SlumpLegend machine={machine} />}
          />
          <div className="relative mx-2 mt-2 mb-3 min-h-0 flex-1 sm:mx-3">
            <SlumpChart points={snapshot.slump} hits={snapshot.hits} machine={machine} fill />
          </div>
        </Card>
      )}

      {view === "hits" && (
        <Card className="flex min-h-64 flex-1 flex-col">
          <CardHeader
            title="当たり履歴"
            description={
              hasArtGames(machine)
                ? "ボナ・ART間は前の当たりから、ボナ間は前のボーナスからの回転数"
                : "ゲーム数は前の当たりからの回転数"
            }
          />
          {/* 一覧の長さでページが伸びないよう、残りの高さに敷いて、その中でスクロールさせる */}
          <div className="relative mt-2 min-h-0 flex-1">
            <HitTable className="absolute inset-0" sessionId={session.id} hits={snapshot.hits} machine={machine} />
          </div>
        </Card>
      )}

      {view === "count" &&
        (counters.length > 0 ? (
          <ManualCounterBoard session={session} counters={counters} />
        ) : (
          <Card className="px-5 py-12 text-center text-sm text-zinc-400">
            この機種には、手で数えるものが設定されていません（機種設定の counters）。
          </Card>
        ))}
    </div>
  );
}

const VIEW_ICONS = { data: Gauge, graph: ChartLine, hits: ListOrdered, count: Tally5 } as const;

/** 画面の切り替え。URL の検索パラメーターに持たせるので、再読み込みしても同じ画面になる */
function ViewTabs({ views, view }: { views: readonly DashboardView[]; view: DashboardView }) {
  return (
    <nav aria-label="画面の切り替え" className="inline-flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
      {views.map((key) => {
        const Icon = VIEW_ICONS[key];
        return (
          <Link
            key={key}
            to="."
            search={{ view: key }}
            replace
            aria-current={key === view ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-zinc-400 transition-colors hover:text-zinc-100",
              key === view && "bg-white/10 text-zinc-50",
            )}
          >
            {/* スマホの幅では 4 つが 1 行に収まらないので、アイコンを省いて文字だけにする */}
            <Icon className="hidden size-4 sm:block" aria-hidden="true" />
            {DASHBOARD_VIEWS[key]}
          </Link>
        );
      })}
    </nav>
  );
}

function SessionPeriod({ session }: { session: SessionDetail }) {
  const nowUs = useNowUs(30_000);
  const ended = session.endedAtUs !== null;
  const durationUs = (session.endedAtUs ?? nowUs) - session.startedAtUs;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-400">
      {!ended && (
        <span className="inline-flex items-center gap-1.5 text-zinc-200">
          <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
          進行中
        </span>
      )}
      <span>
        {formatDateTime(session.startedAtUs)} 〜 {ended ? formatDateTime(session.endedAtUs ?? 0) : ""}
      </span>
      <span className="text-zinc-500">（{formatDuration(durationUs)}）</span>
    </p>
  );
}
