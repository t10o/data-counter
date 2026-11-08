import { join } from "node:path";
import type {
  DeviceStatus,
  IngestRequest,
  ManualCounts,
  SessionDetail,
  SessionListItem,
  StoredEdgeEvent,
} from "@data-counter/core";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { Ingestor } from "./ingest.ts";
import { LiveFeed } from "./live-feed.ts";
import { MachineRegistry } from "./machines.ts";
import { SessionService } from "./sessions.ts";
import { Store } from "./store.ts";

const MACHINES_DIR = join(import.meta.dirname, "../../../machines");
const IN = 1;
const OUT = 2;
const BIG = 4;

function setup({ ingestToken }: { ingestToken?: string } = {}) {
  const clock = { nowUs: 1_760_000_000_000_000 };
  const nowUs = () => clock.nowUs;

  const store = new Store(openDatabase(":memory:"));
  const machines = MachineRegistry.load(MACHINES_DIR);
  const sessions = new SessionService(store, machines, { defaultMachineId: "discup2", nowUs });
  const ingestor = new Ingestor(store, sessions, { nowUs });
  const feed = new LiveFeed(sessions, ingestor);
  const app = createApp({ store, machines, sessions, ingestor, feed, ingestToken });

  const request = async <T>(path: string, init: RequestInit = {}) => {
    const response = await app.request(path, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    return { status: response.status, body: (await response.json()) as T };
  };

  return { clock, request, pico: new FakePico(clock) };
}

/** Pico と同じ形のイベントを作る。Pico の時計とサーバーの時計は一緒に進める */
class FakePico {
  readonly boot = "0badc0de";
  readonly #clock: { nowUs: number };
  #seq = 0;
  #tUs = 5_000_000;
  #pending: IngestRequest["events"] = [];

  constructor(clock: { nowUs: number }) {
    this.#clock = clock;
  }

  wait(ms: number): this {
    this.#tUs += ms * 1000;
    this.#clock.nowUs += ms * 1000;
    return this;
  }

  edge(pin: number, level: 0 | 1): this {
    this.#pending.push([++this.#seq, pin, level, this.#tUs]);
    return this;
  }

  pulses(pin: number, count = 1): this {
    for (let i = 0; i < count; i++) this.edge(pin, 0).wait(40).edge(pin, 1).wait(60);
    return this;
  }

  games(count: number, payout = 0): this {
    for (let i = 0; i < count; i++) this.pulses(IN, 3).pulses(OUT, payout).wait(3000);
    return this;
  }

  /** たまっているイベントを送信用の本文にして、手元からは消す */
  flush(): IngestRequest {
    const events = this.#pending;
    this.#pending = [];
    return { device: "pico-test", boot: this.boot, now: this.#tUs, events, remaining: 0, status: { rssi: -55 } };
  }
}

const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
  headers,
});

describe("POST /api/ingest", () => {
  it("stores events and acknowledges the highest seq", async () => {
    const { request, pico } = setup();

    const response = await request<{ ack: number }>("/api/ingest", post(pico.games(3, 2).flush()));

    expect(response).toEqual({ status: 200, body: { ack: 30 } });
  });

  it("does not store resent events twice", async () => {
    const { request, pico } = setup();
    const body = pico.games(2).flush();

    await request("/api/ingest", post(body));
    const resent = await request<{ ack: number }>("/api/ingest", post(body));
    const events = await request<StoredEdgeEvent[]>("/api/events?from=0");

    expect(resent.body.ack).toBe(12);
    expect(events.body).toHaveLength(12);
  });

  it("converts the Pico clock to wall-clock time", async () => {
    const { request, pico, clock } = setup();
    pico.wait(1000).edge(IN, 0);
    const sentAtUs = clock.nowUs;

    await request("/api/ingest", post(pico.flush()));
    const events = await request<StoredEdgeEvent[]>("/api/events?from=0");

    expect(events.body[0]).toMatchObject({ seq: 1, pin: IN, edge: "fall", tUs: 6_000_000, atUs: sentAtUs });
  });

  it("keeps the clock right while a backlog is being sent", async () => {
    const { request, pico, clock } = setup();
    // 10 秒前に起きて、送れずにたまっていたイベント
    pico.edge(IN, 0).wait(10_000);

    await request("/api/ingest", post({ ...pico.flush(), remaining: 500 }));
    const events = await request<StoredEdgeEvent[]>("/api/events?from=0");

    expect(events.body[0]?.atUs).toBe(clock.nowUs - 10_000_000);
  });

  it("requires the token when INGEST_TOKEN is set", async () => {
    const { request, pico } = setup({ ingestToken: "secret" });
    const body = pico.games(1).flush();

    expect((await request("/api/ingest", post(body))).status).toBe(401);
    expect((await request("/api/ingest", post(body, { authorization: "Bearer secret" }))).status).toBe(200);
  });

  it("rejects malformed payloads", async () => {
    const { request } = setup();

    const response = await request<{ error: string }>("/api/ingest", post({ device: "pico", events: "nope" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("boot");
  });
});

describe("sessions", () => {
  it("starts a session automatically when events arrive", async () => {
    const { request, pico } = setup();
    // 1 回に送れるのは 1000 件まで
    await request("/api/ingest", post(pico.games(100).flush()));
    await request("/api/ingest", post(pico.pulses(BIG).games(20, 10).flush()));

    const { body } = await request<SessionDetail>("/api/sessions/current");

    expect(body).toMatchObject({ machineId: "discup2", endedAtUs: null });
    expect(body.snapshot).toMatchObject({ totalGames: 120, in: 360, out: 200, currentGames: 20 });
    expect(body.snapshot.hits).toMatchObject([{ kindId: "big", games: 100 }]);
  });

  it("keeps the numbers of the previous session when a new one starts", async () => {
    const { request, pico } = setup();
    await request("/api/ingest", post(pico.games(10).flush()));

    const started = await request<SessionDetail>("/api/sessions", post({ machineId: "eureka-typeart" }));
    await request("/api/ingest", post(pico.wait(1000).games(5).flush()));
    const list = await request<SessionListItem[]>("/api/sessions");

    expect(started.status).toBe(201);
    expect(list.body.map((session) => [session.machineId, session.summary.totalGames])).toEqual([
      ["eureka-typeart", 5],
      ["discup2", 10],
    ]);
  });

  it("recounts a session from the raw events when its machine is changed", async () => {
    const { request, pico } = setup();
    await request("/api/ingest", post(pico.games(10).flush()));
    const { body: current } = await request<SessionDetail>("/api/sessions/current");

    const { body } = await request<SessionDetail>(`/api/sessions/${current.id}`, {
      ...post({ machineId: "eureka-typeart" }),
      method: "PATCH",
    });

    expect(body.machineId).toBe("eureka-typeart");
    expect(body.snapshot).toMatchObject({ machineId: "eureka-typeart", totalGames: 10 });
  });

  it("rejects unknown machines", async () => {
    const { request } = setup();

    const response = await request<{ error: string }>("/api/sessions", post({ machineId: "nope" }));

    expect(response.status).toBe(400);
  });
});

/** 手で数えるものが設定してある機種（エウレカ）で実戦を始める */
async function startCountable() {
  const context = setup();
  const { body } = await context.request<SessionDetail>("/api/sessions", post({ machineId: "eureka-typeart" }));
  const count = (counterId: string, method: "POST" | "DELETE" = "POST", id = body.id) => {
    context.clock.nowUs += 1_000_000;
    return context.request<ManualCounts>(`/api/sessions/${id}/counts/${counterId}`, { method });
  };
  return { ...context, session: body, count };
}

describe("manual counts", () => {
  it("counts per session and undoes the latest one", async () => {
    const { request, session, count } = await startCountable();

    await count("reach-white");
    await count("reach-white");
    await count("riri-cherry");
    const undone = await count("reach-white", "DELETE");
    const { body } = await request<SessionDetail>("/api/sessions/current");

    expect(session.manualCounts).toEqual({});
    expect(undone).toEqual({ status: 200, body: { "reach-white": 1, "riri-cherry": 1 } });
    expect(body.manualCounts).toEqual({ "reach-white": 1, "riri-cherry": 1 });
  });

  it("does nothing when undoing a counter that has not been counted", async () => {
    const { count } = await startCountable();

    expect(await count("reach-black", "DELETE")).toEqual({ status: 200, body: {} });
  });

  it("keeps the counts with the session they were made in", async () => {
    const { request, session, count } = await startCountable();
    await count("reach-black");

    await request("/api/sessions", post({ machineId: "eureka-typeart" }));
    const previous = await request<SessionDetail>(`/api/sessions/${session.id}`);
    const current = await request<SessionDetail>("/api/sessions/current");

    expect(previous.body.manualCounts).toEqual({ "reach-black": 1 });
    expect(current.body.manualCounts).toEqual({});
  });

  it("only counts in the current session", async () => {
    const { request, session, count } = await startCountable();
    await request("/api/sessions", post({ machineId: "eureka-typeart" }));

    expect((await count("reach-white", "POST", session.id)).status).toBe(409);
    expect((await count("reach-white", "DELETE", session.id)).status).toBe(409);
    expect((await count("reach-white", "POST", 999)).status).toBe(404);
  });

  it("rejects counters the machine does not have", async () => {
    const { request, count } = await startCountable();
    expect((await count("nope")).status).toBe(400);

    // ディスクアップ2 には手で数えるものの設定がない
    const { body } = await request<SessionDetail>("/api/sessions", post({ machineId: "discup2" }));
    expect((await count("reach-white", "POST", body.id)).status).toBe(400);
  });
});

describe("GET /api/devices", () => {
  it("returns the latest report of each device", async () => {
    const { request, pico } = setup();
    await request("/api/ingest", post(pico.games(1).flush()));

    const { body } = await request<DeviceStatus[]>("/api/devices");

    expect(body).toMatchObject([{ deviceId: "pico-test", bootId: pico.boot, report: { rssi: -55 } }]);
  });
});
