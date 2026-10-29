import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";

export function RoutePending() {
  return (
    <div className="grid min-h-64 place-items-center text-zinc-500" role="status">
      <LoaderCircle className="size-6 animate-spin" aria-label="読み込み中" />
    </div>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto grid max-w-md gap-4 py-16 text-center">
      <p className="font-semibold text-zinc-100">読み込めませんでした</p>
      <p className="text-sm text-zinc-400">{error instanceof Error ? error.message : String(error)}</p>
      <div>
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          もう一度読み込む
        </Button>
      </div>
    </div>
  );
}
