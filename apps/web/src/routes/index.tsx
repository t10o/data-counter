import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable } from "lucide-react";
import { SessionDashboard } from "../components/session/session-dashboard";
import { StartSessionButton } from "../components/session/start-session-button";
import { Card } from "../components/ui/card";
import { currentSessionQuery, machinesQuery } from "../lib/queries";

export const Route = createFileRoute("/")({
  loader: ({ context: { queryClient } }) =>
    Promise.all([queryClient.ensureQueryData(currentSessionQuery()), queryClient.ensureQueryData(machinesQuery())]),
  component: LivePage,
});

function LivePage() {
  const { data: session } = useSuspenseQuery(currentSessionQuery());
  const { data: machines } = useSuspenseQuery(machinesQuery());

  if (session === null) {
    return (
      <Card className="mx-auto mt-10 grid max-w-lg justify-items-center gap-4 px-6 py-12 text-center">
        <Cable className="size-8 text-zinc-500" aria-hidden="true" />
        <div>
          <h1 className="font-semibold text-zinc-100">まだデータがありません</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Pico からイベントが届くと、自動で実戦が始まります。
            <br />
            届いているかどうかは
            <Link to="/device" className="mx-1 text-zinc-100 underline underline-offset-4">
              端子
            </Link>
            のページで確かめられます。
          </p>
        </div>
        <StartSessionButton machines={machines} />
      </Card>
    );
  }

  return (
    <SessionDashboard
      session={session}
      machine={machines.find((machine) => machine.id === session.machineId)}
      actions={<StartSessionButton machines={machines} defaultMachineId={session.machineId} />}
    />
  );
}
