import type { MachineConfig, SessionListItem } from "@data-counter/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card } from "../../components/ui/card";
import { KindMark } from "../../components/ui/kind-mark";
import { cn } from "../../lib/cn";
import { formatDateTime, formatDuration, formatInteger, formatPercent, formatSigned } from "../../lib/format";
import { kindShape } from "../../lib/machine";
import { machinesQuery, sessionListQuery } from "../../lib/queries";

export const Route = createFileRoute("/sessions/")({
  head: () => ({ meta: [{ title: "履歴 | データカウンター" }] }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([queryClient.ensureQueryData(sessionListQuery()), queryClient.ensureQueryData(machinesQuery())]),
  component: SessionsPage,
});

function SessionsPage() {
  const { data: sessions } = useSuspenseQuery(sessionListQuery());
  const { data: machines } = useSuspenseQuery(machinesQuery());

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-50 sm:text-2xl">履歴</h1>
      <Card>
        {sessions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">まだ実戦がありません</p>
        ) : (
          <SessionTable sessions={sessions} machines={machines} />
        )}
      </Card>
    </div>
  );
}

function SessionTable({ sessions, machines }: { sessions: SessionListItem[]; machines: MachineConfig[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap tabular-nums">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-white/5">
            <th className="py-2.5 pr-3 pl-5 text-left font-medium">開始</th>
            <th className="px-3 py-2.5 text-left font-medium">機種</th>
            <th className="px-3 py-2.5 text-right font-medium">総回転</th>
            <th className="px-3 py-2.5 text-left font-medium">当たり</th>
            <th className="px-3 py-2.5 text-right font-medium">差枚</th>
            <th className="py-2.5 pr-5 pl-3 text-right font-medium">機械割</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const machine = machines.find((m) => m.id === session.machineId);
            const open = () => navigate({ to: "/sessions/$sessionId", params: { sessionId: session.id } });
            return (
              <tr
                key={session.id}
                onClick={open}
                className="cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
              >
                <td className="py-3 pr-3 pl-5">
                  {/* 行のどこを押しても開けるが、キーボードや新しいタブではこのリンクを使う */}
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: session.id }}
                    onClick={(event) => event.stopPropagation()}
                    className="font-medium text-zinc-100"
                  >
                    {formatDateTime(session.startedAtUs)}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {session.endedAtUs === null ? "進行中" : formatDuration(session.endedAtUs - session.startedAtUs)}
                  </p>
                </td>
                <td className="px-3 py-3 text-zinc-300">{machine?.name ?? session.machineId}</td>
                <td className="px-3 py-3 text-right text-zinc-100">{formatInteger(session.summary.totalGames)}</td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {session.summary.kinds.map((kind) => (
                      <span key={kind.id} className="inline-flex items-center gap-1.5 text-zinc-300">
                        <KindMark color={kind.color} shape={kindShape(machine, kind.id)} size={8} />
                        {kind.label} {kind.count}
                      </span>
                    ))}
                  </span>
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-semibold",
                    session.summary.diff > 0 ? "text-emerald-400" : session.summary.diff < 0 ? "text-rose-400" : "",
                  )}
                >
                  {formatSigned(session.summary.diff)}
                </td>
                <td className="py-3 pr-5 pl-3 text-right text-zinc-300">{formatPercent(session.summary.payoutRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
