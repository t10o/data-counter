import type { SessionDetail } from "@data-counter/core";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const queryKeys = {
  machines: ["machines"],
  sessions: ["sessions"],
  sessionList: ["sessions", "list"],
  currentSession: ["sessions", "current"],
  session: (id: number) => ["sessions", "detail", id],
  devices: ["devices"],
  events: (fromUs: number, toUs: number) => ["events", fromUs, toUs],
} as const;

export const machinesQuery = () =>
  queryOptions({ queryKey: queryKeys.machines, queryFn: api.machines, staleTime: Number.POSITIVE_INFINITY });

/** 進行中の実戦。中身は /api/stream からも届くので、取り直しはまれでよい */
export const currentSessionQuery = () =>
  queryOptions({ queryKey: queryKeys.currentSession, queryFn: api.currentSession, staleTime: 60_000 });

export const sessionListQuery = () => queryOptions({ queryKey: queryKeys.sessionList, queryFn: api.sessions });

export const sessionQuery = (id: number) =>
  queryOptions({ queryKey: queryKeys.session(id), queryFn: () => api.session(id) });

export const devicesQuery = () =>
  queryOptions({ queryKey: queryKeys.devices, queryFn: api.devices, staleTime: 60_000 });

/** 生イベントは後から変わらないので、一度取れば十分 */
export const eventsQuery = (fromUs: number, toUs: number) =>
  queryOptions({
    queryKey: queryKeys.events(fromUs, toUs),
    queryFn: () => api.events(fromUs, toUs),
    staleTime: 30_000,
  });

function useSessionWriter() {
  const queryClient = useQueryClient();
  return (session: SessionDetail) => {
    queryClient.setQueryData(queryKeys.session(session.id), session);
    if (session.endedAtUs === null) queryClient.setQueryData(queryKeys.currentSession, session);
    return queryClient.invalidateQueries({ queryKey: queryKeys.sessionList });
  };
}

export function useStartSession() {
  const write = useSessionWriter();
  return useMutation({ mutationFn: api.startSession, onSuccess: write });
}

export function useChangeSessionMachine(id: number) {
  const write = useSessionWriter();
  return useMutation({
    mutationFn: (machineId: string) => api.updateSession(id, { machineId }),
    onSuccess: write,
  });
}

/**
 * 手で数えるもの（リーチ目など）を 1 回足す（step: -1 なら最後の 1 回を取り消す）。
 * 続けて押しても順番が入れ替わらないよう、同じ実戦への書き込みは 1 つずつ送る
 */
export function useManualCount(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: `manual-count:${sessionId}` },
    mutationFn: ({ counterId, step }: { counterId: string; step: 1 | -1 }) =>
      step > 0 ? api.addManualCount(sessionId, counterId) : api.removeManualCount(sessionId, counterId),
    onSuccess: (manualCounts) => {
      const update = (session: SessionDetail | null | undefined) =>
        session?.id === sessionId ? { ...session, manualCounts } : session;
      queryClient.setQueryData(queryKeys.currentSession, update);
      queryClient.setQueryData(queryKeys.session(sessionId), update);
    },
  });
}
