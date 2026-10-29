import type { DeviceStatus, StoredEdgeEvent, StreamMessages } from "@data-counter/core";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { queryKeys } from "./queries";

export type LiveStatus = "connecting" | "open" | "reconnecting";

/** 端子のページで見せる生イベントの件数 */
const MAX_EDGES = 1000;
const NO_EDGES: readonly StoredEdgeEvent[] = [];

/**
 * /api/stream（Server-Sent Events）をアプリ全体で 1 本だけ開き、
 * 届いた集計結果や端末の状態を TanStack Query のキャッシュに書き込む。
 */
class LiveStream {
  #status: LiveStatus = "connecting";
  #edges: readonly StoredEdgeEvent[] = NO_EDGES;
  readonly #listeners = new Set<() => void>();

  get status(): LiveStatus {
    return this.#status;
  }

  get edges(): readonly StoredEdgeEvent[] {
    return this.#edges;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  connect(queryClient: QueryClient): () => void {
    const source = new EventSource("/api/stream");
    let currentSessionId: number | null | undefined;

    const on = <K extends keyof StreamMessages>(type: K, handle: (data: StreamMessages[K]) => void) => {
      source.addEventListener(type, (event) => handle(JSON.parse(event.data as string) as StreamMessages[K]));
    };

    source.addEventListener("open", () => {
      // 切れていた間の変化を取り直す
      if (this.#status === "reconnecting") void queryClient.invalidateQueries();
      this.#setStatus("open");
    });
    source.addEventListener("error", () => this.#setStatus("reconnecting"));

    on("session", (session) => {
      queryClient.setQueryData(queryKeys.currentSession, session);
      if (session) queryClient.setQueryData(queryKeys.session(session.id), session);

      const id = session?.id ?? null;
      if (currentSessionId !== undefined && currentSessionId !== id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      }
      currentSessionId = id;
    });

    on("device", (device) => {
      queryClient.setQueryData<DeviceStatus[]>(queryKeys.devices, (devices = []) => [
        ...devices.filter((d) => d.deviceId !== device.deviceId),
        device,
      ]);
    });

    on("edges", (edges) => {
      this.#edges = [...this.#edges, ...edges].slice(-MAX_EDGES);
      this.#emit();
    });

    return () => source.close();
  }

  #setStatus(status: LiveStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

const liveStream = new LiveStream();

export function useLiveStream(queryClient: QueryClient): void {
  useEffect(() => liveStream.connect(queryClient), [queryClient]);
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    liveStream.subscribe,
    () => liveStream.status,
    () => "connecting",
  );
}

export function useLiveEdges(): readonly StoredEdgeEvent[] {
  return useSyncExternalStore(
    liveStream.subscribe,
    () => liveStream.edges,
    () => NO_EDGES,
  );
}
