import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DeviceCard } from "../components/device/device-card";
import { EdgeLog, PulseSummary } from "../components/device/edge-log";
import { Card, CardHeader } from "../components/ui/card";
import { useLiveEdges } from "../lib/live-stream";
import { currentSessionQuery, devicesQuery, machinesQuery } from "../lib/queries";

export const Route = createFileRoute("/device")({
  head: () => ({ meta: [{ title: "端子 | データカウンター" }] }),
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(devicesQuery()),
      queryClient.ensureQueryData(machinesQuery()),
      queryClient.ensureQueryData(currentSessionQuery()),
    ]),
  component: DevicePage,
});

function DevicePage() {
  const { data: devices } = useSuspenseQuery(devicesQuery());
  const { data: machines } = useSuspenseQuery(machinesQuery());
  const { data: session } = useSuspenseQuery(currentSessionQuery());
  const machine = machines.find((m) => m.id === session?.machineId);
  const edges = useLiveEdges();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50 sm:text-2xl">端子</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pico の状態と、届いた生のイベント。配線の確認やパルス幅の測定に使います。
        </p>
      </div>

      {devices.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-zinc-400">
          まだ Pico から何も届いていません。firmware/README.md の手順で Pico を設定してください。
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {devices.map((device) => (
            <DeviceCard key={device.deviceId} device={device} machine={machine} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="パルス幅" description="このページを開いてから届いた ON の長さ（fall から rise まで）" />
        <div className="pt-2">
          <PulseSummary edges={edges} machine={machine} />
        </div>
      </Card>

      <Card>
        <CardHeader title="届いたイベント" description="新しいものが上。最新 200 件" />
        <div className="pt-2">
          <EdgeLog edges={edges} machine={machine} />
        </div>
      </Card>
    </div>
  );
}
