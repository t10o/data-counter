import type {
  DeviceStatus,
  MachineConfig,
  ManualCounts,
  SessionDetail,
  SessionListItem,
  StartSessionRequest,
  StoredEdgeEvent,
  UpdateSessionRequest,
} from "@data-counter/core";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
}

async function request<T>(path: string, { method = "GET", json }: RequestOptions = {}): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    json === undefined
      ? { method }
      : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(json) },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

export const api = {
  machines: () => request<MachineConfig[]>("/machines"),
  currentSession: () => request<SessionDetail | null>("/sessions/current"),
  sessions: () => request<SessionListItem[]>("/sessions"),
  session: (id: number) => request<SessionDetail>(`/sessions/${id}`),
  startSession: (body: StartSessionRequest) => request<SessionDetail>("/sessions", { method: "POST", json: body }),
  updateSession: (id: number, body: UpdateSessionRequest) =>
    request<SessionDetail>(`/sessions/${id}`, { method: "PATCH", json: body }),
  addManualCount: (id: number, counterId: string) =>
    request<ManualCounts>(`/sessions/${id}/counts/${encodeURIComponent(counterId)}`, { method: "POST" }),
  removeManualCount: (id: number, counterId: string) =>
    request<ManualCounts>(`/sessions/${id}/counts/${encodeURIComponent(counterId)}`, { method: "DELETE" }),
  events: (fromUs: number, toUs: number) =>
    request<StoredEdgeEvent[]>(`/events?${new URLSearchParams({ from: String(fromUs), to: String(toUs) })}`),
  devices: () => request<DeviceStatus[]>("/devices"),
};
