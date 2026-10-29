import type { DeviceStatus, MachineConfig } from "@data-counter/core";
import { Wifi, WifiOff } from "lucide-react";
import { useNowUs } from "../../hooks/use-now";
import { cn } from "../../lib/cn";
import { formatDuration, formatInteger, formatTime } from "../../lib/format";
import { pinLabel } from "../../lib/machine";
import { Card } from "../ui/card";

/** Pico は 5 秒ごとに送ってくるので、これだけ途切れたらつながっていないとみなす */
const OFFLINE_AFTER_US = 15_000_000;

interface DeviceCardProps {
  device: DeviceStatus;
  machine: MachineConfig | undefined;
}

export function DeviceCard({ device, machine }: DeviceCardProps) {
  const nowUs = useNowUs(1000);
  const online = nowUs - device.lastSeenAtUs < OFFLINE_AFTER_US;
  const { rssi, memFree, dropped, levels } = device.report;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-50">{device.deviceId}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            起動 ID {device.bootId}・最終受信 {formatTime(device.lastSeenAtUs)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            online ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-800 text-zinc-400",
          )}
        >
          {online ? (
            <Wifi className="size-3.5" aria-hidden="true" />
          ) : (
            <WifiOff className="size-3.5" aria-hidden="true" />
          )}
          {online ? "受信中" : "途切れています"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Item label="稼働時間" value={formatDuration(device.uptimeUs)} />
        <Item label="Wi-Fi の強さ" value={rssi === undefined ? "—" : `${rssi} dBm`} />
        <Item
          label="空きメモリ"
          value={memFree === undefined ? "—" : `${formatInteger(Math.round(memFree / 1024))} KB`}
        />
        <Item
          label="取りこぼし"
          value={dropped === undefined ? "—" : `${formatInteger(dropped)} 件`}
          warn={dropped !== undefined && dropped > 0}
        />
      </dl>

      {levels && levels.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">いまの端子の状態</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {levels.map(([pin, level]) => (
              <li
                key={pin}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs ring-1",
                  level === 0 ? "bg-zinc-100 text-zinc-900 ring-zinc-100" : "text-zinc-400 ring-white/10",
                )}
              >
                {pin}番 {pinLabel(pin, machine)}：{level === 0 ? "ON" : "OFF"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Item({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={cn("mt-0.5 font-medium tabular-nums", warn ? "text-amber-300" : "text-zinc-100")}>{value}</dd>
    </div>
  );
}
