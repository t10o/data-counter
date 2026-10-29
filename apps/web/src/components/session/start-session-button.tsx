import type { MachineConfig } from "@data-counter/core";
import { Plus } from "lucide-react";
import { type FormEvent, useId, useRef } from "react";
import { useStartSession } from "../../lib/queries";
import { Button } from "../ui/button";

interface StartSessionButtonProps {
  machines: readonly MachineConfig[];
  defaultMachineId?: string | undefined;
}

/** 今の実戦を区切って、新しい実戦を始める */
export function StartSessionButton({ machines, defaultMachineId }: StartSessionButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const startSession = useStartSession();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const machineId = new FormData(event.currentTarget).get("machineId");
    if (typeof machineId !== "string") return;
    startSession.mutate({ machineId }, { onSuccess: () => dialogRef.current?.close() });
  };

  return (
    <>
      <Button onClick={() => dialogRef.current?.showModal()}>
        <Plus className="size-4" aria-hidden="true" />
        新しい実戦
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-zinc-900 p-0 text-zinc-100 ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <form onSubmit={handleSubmit} className="grid gap-5 p-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              新しい実戦を始める
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              今の実戦はここで区切られます。生のイベントは消えないので、あとから見直せます。
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-zinc-300">機種</legend>
            {machines.map((machine) => (
              <label
                key={machine.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-white/10 has-checked:bg-white/5 has-checked:ring-zinc-300/60"
              >
                <input
                  type="radio"
                  name="machineId"
                  value={machine.id}
                  defaultChecked={machine.id === (defaultMachineId ?? machines[0]?.id)}
                  className="mt-1 accent-zinc-100"
                />
                <span>
                  <span className="block text-sm font-medium">{machine.name}</span>
                  {machine.maker && <span className="block text-xs text-zinc-500">{machine.maker}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          {startSession.error && <p className="text-sm text-rose-400">{startSession.error.message}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              やめる
            </Button>
            <Button type="submit" variant="primary" disabled={startSession.isPending}>
              始める
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
