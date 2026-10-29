import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MachineSelect } from "../../../components/session/machine-select";
import { SessionDashboard } from "../../../components/session/session-dashboard";
import { machinesQuery, sessionQuery } from "../../../lib/queries";

export const Route = createFileRoute("/sessions/$sessionId/")({
  head: () => ({ meta: [{ title: "実戦 | データカウンター" }] }),
  component: SessionPage,
});

function SessionPage() {
  const { sessionId } = Route.useParams();
  const { data: session } = useSuspenseQuery(sessionQuery(sessionId));
  const { data: machines } = useSuspenseQuery(machinesQuery());

  return (
    <SessionDashboard
      session={session}
      machine={machines.find((machine) => machine.id === session.machineId)}
      actions={<MachineSelect session={session} machines={machines} />}
    />
  );
}
