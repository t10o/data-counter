import { Link } from "@tanstack/react-router";
import { Activity, Cable, History } from "lucide-react";
import { cn } from "../lib/cn";
import { type LiveStatus, useLiveStatus } from "../lib/live-stream";

const NAV = [
  { to: "/", label: "データ", icon: Activity, exact: true },
  { to: "/sessions", label: "履歴", icon: History, exact: false },
  { to: "/device", label: "端子", icon: Cable, exact: false },
] as const;

export function AppHeader() {
  return (
    <header className="z-20 shrink-0 border-b border-white/5 bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
          <img src="/favicon.svg" alt="" className="size-6" />
          <span className="hidden sm:inline">データカウンター</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
              activeProps={{ className: "bg-white/10 text-zinc-50" }}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <LiveIndicator />
      </div>
    </header>
  );
}

const LIVE_LABELS: Record<LiveStatus, string> = {
  connecting: "接続中",
  open: "ライブ",
  reconnecting: "再接続中",
};

function LiveIndicator() {
  const status = useLiveStatus();
  return (
    <p className="ml-auto flex items-center gap-2 text-xs text-zinc-400" role="status">
      <span
        className={cn("size-2 rounded-full", status === "open" ? "bg-emerald-400" : "animate-pulse bg-amber-400")}
        aria-hidden="true"
      />
      {LIVE_LABELS[status]}
    </p>
  );
}
