import type { MachineConfig, Session } from "@data-counter/core";
import { useChangeSessionMachine } from "../../lib/queries";

interface MachineSelectProps {
  session: Session;
  machines: readonly MachineConfig[];
}

/** 実戦の機種を付け替える。生のイベントから数え直すので、何度変えてもよい */
export function MachineSelect({ session, machines }: MachineSelectProps) {
  const changeMachine = useChangeSessionMachine(session.id);

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      機種
      <select
        value={session.machineId}
        disabled={changeMachine.isPending}
        onChange={(event) => changeMachine.mutate(event.target.value)}
        className="h-9 rounded-lg bg-white/5 px-3 text-zinc-100 ring-1 ring-white/10 disabled:opacity-50"
      >
        {machines.map((machine) => (
          <option key={machine.id} value={machine.id}>
            {machine.name}
          </option>
        ))}
      </select>
    </label>
  );
}
