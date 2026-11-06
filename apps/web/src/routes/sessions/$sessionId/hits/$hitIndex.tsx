import type { Hit, MachineConfig, StoredEdgeEvent } from "@data-counter/core";
import { keepPreviousData, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { z } from "zod";
import { EdgeTimeline, type TimelineLane } from "../../../../components/timeline/edge-timeline";
import { Card, CardHeader } from "../../../../components/ui/card";
import { KindMark } from "../../../../components/ui/kind-mark";
import { cn } from "../../../../lib/cn";
import {
  formatDuration,
  formatInteger,
  formatMs,
  formatOffset,
  formatSigned,
  formatTime,
} from "../../../../lib/format";
import { hasArtGames, KIND_COLORS, kindShape, pinLabel } from "../../../../lib/machine";
import { withIntervals } from "../../../../lib/pulses";
import { eventsQuery, machinesQuery, sessionQuery } from "../../../../lib/queries";

const SPANS = [10, 30, 60] as const;
const FOCUSES = { start: "当選の前後", end: "終了の前後", all: "全体" } as const;

// リンクでは省略できるよう default を、変な値が来ても落ちないよう catch を付ける
const searchSchema = z.object({
  span: z.literal(SPANS).default(30).catch(30),
  focus: z.enum(["start", "end", "all"]).default("start").catch("start"),
});

export const Route = createFileRoute("/sessions/$sessionId/hits/$hitIndex")({
  params: {
    parse: ({ hitIndex }) => ({ hitIndex: Number(hitIndex) }),
    stringify: ({ hitIndex }) => ({ hitIndex: String(hitIndex) }),
  },
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "答え合わせ | データカウンター" }] }),
  component: HitPage,
});

function HitPage() {
  const { sessionId, hitIndex } = Route.useParams();
  const { data: session } = useSuspenseQuery(sessionQuery(sessionId));
  const { data: machines } = useSuspenseQuery(machinesQuery());
  const machine = machines.find((m) => m.id === session.machineId);
  const hit = session.snapshot.hits.find((h) => h.index === hitIndex);

  if (hit === undefined) {
    return <p className="py-16 text-center text-zinc-400">この当たりは見つかりませんでした</p>;
  }

  const hits = session.snapshot.hits;
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex items-center justify-between gap-2 text-sm">
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId }}
          search={{ view: "hits" }}
          className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          実戦に戻る
        </Link>
        <div className="flex gap-1">
          <HitLink sessionId={sessionId} hit={hits[hit.index - 2]} direction="previous" />
          <HitLink sessionId={sessionId} hit={hits[hit.index]} direction="next" />
        </div>
      </nav>

      <HitHeader hit={hit} machine={machine} />
      <HitEvents sessionId={sessionId} hit={hit} machine={machine} />
    </div>
  );
}

function HitHeader({ hit, machine }: { hit: Hit; machine: MachineConfig | undefined }) {
  const artGames = hasArtGames(machine);

  return (
    <header className="flex flex-col gap-3">
      <h1 className="flex items-center gap-2.5 text-xl font-semibold text-zinc-50 sm:text-2xl">
        <KindMark color={hit.color} shape={kindShape(machine, hit.kindId)} size={14} />
        {hit.index} 回目 {hit.label}
        <span className="text-base font-normal text-zinc-400">
          {formatInteger(artGames ? hit.gamesAny : hit.games)} G で当選
        </span>
      </h1>
      <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Fact label="当選時刻" value={formatTime(hit.startedAtUs)} />
        {artGames && <Fact label="ボナ間" value={`${formatInteger(hit.games)} G`} />}
        <Fact label="総回転" value={`${formatInteger(hit.totalGames)} G`} />
        <Fact label="当選時の差枚" value={formatSigned(hit.diff)} />
        <Fact
          label="信号が ON の間"
          value={
            hit.endedAtUs === null
              ? "継続中"
              : `${formatDuration(hit.endedAtUs - hit.startedAtUs)}・${formatInteger(hit.gamesDuring)} G・${formatInteger(hit.out)} 枚`
          }
        />
      </dl>
    </header>
  );
}

function HitEvents({ sessionId, hit, machine }: { sessionId: number; hit: Hit; machine: MachineConfig | undefined }) {
  const { span, focus } = Route.useSearch();
  const endUs = hit.endedAtUs ?? hit.startedAtUs;
  const centerUs = focus === "end" ? endUs : hit.startedAtUs;
  const fromUs = (focus === "all" ? hit.startedAtUs : centerUs) - span * 1e6;
  const toUs = (focus === "all" ? endUs : centerUs) + span * 1e6;

  const { data: events = [], isFetching } = useQuery({
    ...eventsQuery(fromUs, toUs),
    // 範囲を変えている間も前の図を出しておく
    placeholderData: keepPreviousData,
  });

  const lanes = timelineLanes(machine, hit);
  const markers = [
    { atUs: hit.startedAtUs, label: "当選" },
    ...(hit.endedAtUs === null ? [] : [{ atUs: hit.endedAtUs, label: "終了" }]),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          options={Object.entries(FOCUSES).map(([value, label]) => ({ value, label }))}
          value={focus}
          search={(value) => ({ focus: value as keyof typeof FOCUSES, span })}
          sessionId={sessionId}
          hitIndex={hit.index}
        />
        <Segmented
          options={SPANS.map((value) => ({ value: String(value), label: `±${value}秒` }))}
          value={String(span)}
          search={(value) => ({ focus, span: Number(value) as (typeof SPANS)[number] })}
          sessionId={sessionId}
          hitIndex={hit.index}
        />
      </div>

      <Card className={cn("transition-opacity", isFetching && "opacity-60")}>
        <CardHeader title="端子のタイミング" description="チャタリング除去前の生のイベント。0 秒が当選した瞬間" />
        <div className="px-5 pt-3 pb-4">
          <EdgeTimeline
            events={events}
            lanes={lanes}
            fromUs={fromUs}
            toUs={toUs}
            originUs={hit.startedAtUs}
            markers={markers}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="イベント一覧" description={`${formatInteger(events.length)} 件`} />
        <EventTable events={events} originUs={hit.startedAtUs} machine={machine} />
      </Card>
    </>
  );
}

function timelineLanes(machine: MachineConfig | undefined, hit: Hit): TimelineLane[] {
  const neutral = "var(--color-chart-line)";
  const lanes: TimelineLane[] = [
    { pin: machine?.pins.in ?? 1, label: "IN", color: neutral },
    { pin: machine?.pins.out ?? 2, label: "OUT", color: neutral },
  ];
  for (const signal of machine?.signals ?? []) {
    const color = signal.pin === hit.pin ? hit.color : signal.kinds.length === 1 ? signal.kinds[0]?.color : "gray";
    lanes.push({ pin: signal.pin, label: pinLabel(signal.pin, machine), color: KIND_COLORS[color ?? "gray"] });
  }
  return lanes;
}

function EventTable({
  events,
  originUs,
  machine,
}: {
  events: readonly StoredEdgeEvent[];
  originUs: number;
  machine: MachineConfig | undefined;
}) {
  if (events.length === 0)
    return <p className="px-5 py-8 text-center text-sm text-zinc-500">この範囲にイベントはありません</p>;

  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full font-mono text-xs whitespace-nowrap tabular-nums">
        <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
          <tr className="border-b border-white/5">
            <th className="py-2 pr-3 pl-5 text-right font-medium">当選から</th>
            <th className="px-3 py-2 text-left font-medium">ピン</th>
            <th className="px-3 py-2 text-left font-medium">変化</th>
            <th className="py-2 pr-5 pl-3 text-right font-medium">直前の変化から</th>
          </tr>
        </thead>
        <tbody>
          {withIntervals(events).map((event) => (
            <tr key={event.id} className="border-b border-white/5 last:border-0">
              <td className="py-1.5 pr-3 pl-5 text-right text-zinc-300">{formatOffset(event.atUs - originUs)}</td>
              <td className="px-3 py-1.5 text-zinc-200">{pinLabel(event.pin, machine)}</td>
              <td className={cn("px-3 py-1.5", event.edge === "fall" ? "text-zinc-50" : "text-zinc-500")}>
                {event.edge === "fall" ? "ON" : "OFF"}
              </td>
              <td className="py-1.5 pr-5 pl-3 text-right text-zinc-400">
                {event.sincePreviousUs === null ? "—" : formatMs(event.sincePreviousUs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-100 tabular-nums">{value}</dd>
    </div>
  );
}

interface SegmentedProps {
  options: { value: string; label: string }[];
  value: string;
  search: (value: string) => z.output<typeof searchSchema>;
  sessionId: number;
  hitIndex: number;
}

/** 表示範囲の切り替え。URL の検索パラメーターに持たせるので、共有や戻るでも同じ図になる */
function Segmented({ options, value, search, sessionId, hitIndex }: SegmentedProps) {
  return (
    <div className="inline-flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map((option) => (
        <Link
          key={option.value}
          to="/sessions/$sessionId/hits/$hitIndex"
          params={{ sessionId, hitIndex }}
          search={search(option.value)}
          replace
          aria-current={option.value === value ? "true" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100",
            option.value === value && "bg-white/10 text-zinc-50",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function HitLink({
  sessionId,
  hit,
  direction,
}: {
  sessionId: number;
  hit: Hit | undefined;
  direction: "previous" | "next";
}) {
  const search = Route.useSearch();
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  const label = direction === "previous" ? "前の当たり" : "次の当たり";
  const content =
    direction === "previous" ? (
      <>
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </>
    ) : (
      <>
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
      </>
    );
  const className = "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs ring-1 ring-white/10";

  if (hit === undefined) {
    return (
      <span className={cn(className, "text-zinc-600")} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <Link
      to="/sessions/$sessionId/hits/$hitIndex"
      params={{ sessionId, hitIndex: hit.index }}
      search={search}
      className={cn(className, "text-zinc-300 hover:bg-white/5 hover:text-zinc-100")}
    >
      {content}
    </Link>
  );
}
