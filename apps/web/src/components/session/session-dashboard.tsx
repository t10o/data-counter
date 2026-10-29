import type { MachineConfig, SessionDetail } from "@data-counter/core";
import type { ReactNode } from "react";
import { useNowUs } from "../../hooks/use-now";
import { formatDateTime, formatDuration } from "../../lib/format";
import { CounterBoard } from "../counter/counter-board";
import { HitTable } from "../counter/hit-table";
import { SlumpChart, SlumpLegend } from "../counter/slump-chart";
import { Card, CardHeader } from "../ui/card";

interface SessionDashboardProps {
  session: SessionDetail;
  machine: MachineConfig | undefined;
  /** 見出しの右側に置く操作 */
  actions?: ReactNode;
}

/** 実戦 1 回分のデータ。進行中の実戦にも、終わった実戦にも使う */
export function SessionDashboard({ session, machine, actions }: SessionDashboardProps) {
  const { snapshot } = session;
  const activeHits = snapshot.hits.filter((hit) => hit.endedAtUs === null && snapshot.activePins.includes(hit.pin));

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-zinc-50 sm:text-2xl">
            {machine?.name ?? session.machineId}
          </h1>
          <SessionPeriod session={session} />
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      <CounterBoard summary={snapshot} machine={machine} activeHits={activeHits} />

      <Card>
        <CardHeader title="スランプグラフ" actions={<SlumpLegend machine={machine} />} />
        <div className="px-2 pt-2 pb-3 sm:px-3">
          <SlumpChart points={snapshot.slump} hits={snapshot.hits} machine={machine} />
        </div>
      </Card>

      <Card>
        <CardHeader title="当たり履歴" description="ゲーム数は前の当たりからの回転数" />
        <div className="pt-2">
          <HitTable sessionId={session.id} hits={snapshot.hits} machine={machine} />
        </div>
      </Card>
    </div>
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
