import {
  CounterEngine,
  type CounterSnapshot,
  type CounterSummary,
  type ManualCounts,
  type Session,
  type SessionDetail,
  type SessionListItem,
  type StoredEdgeEvent,
} from "@data-counter/core";
import { HTTPException } from "hono/http-exception";
import type { MachineRegistry } from "./machines.ts";
import type { Store } from "./store.ts";

export interface SessionServiceOptions {
  /** 実戦を自動で始めるとき、前の実戦がなければこの機種にする */
  defaultMachineId: string;
  nowUs?: () => number;
}

interface LiveSession {
  session: Session;
  engine: CounterEngine;
}

/**
 * 実戦（集計の区切り）を管理する。
 *
 * 進行中の実戦は集計エンジンをメモリに持っておき、イベントが届くたびに足していく。
 * 終わった実戦は必要になったときに生イベントから集計し直し、結果をキャッシュする。
 */
export class SessionService {
  readonly #store: Store;
  readonly #machines: MachineRegistry;
  readonly #defaultMachineId: string;
  readonly #nowUs: () => number;
  readonly #listeners = new Set<() => void>();
  #live: LiveSession | null;

  constructor(store: Store, machines: MachineRegistry, options: SessionServiceOptions) {
    this.#store = store;
    this.#machines = machines;
    this.#defaultMachineId = options.defaultMachineId;
    this.#nowUs = options.nowUs ?? (() => Date.now() * 1000);

    const open = store.openSession();
    this.#live = open ? this.#replay(open) : null;
  }

  /** 進行中の実戦が変わったときに呼ばれる。戻り値を呼ぶと解除 */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  current(): SessionDetail | null {
    const live = this.#live;
    return live && this.#detail(live.session, live.engine.snapshot());
  }

  get(id: number): SessionDetail | null {
    if (this.#live?.session.id === id) return this.current();
    const session = this.#store.session(id);
    return session ? this.#detail(session, this.#closedSnapshot(session)) : null;
  }

  list(limit: number): SessionListItem[] {
    return this.#store.sessions(limit).map((session) => ({
      ...session,
      summary:
        this.#live?.session.id === session.id ? this.#live.engine.summary() : toSummary(this.#closedSnapshot(session)),
    }));
  }

  /** 進行中の実戦を終わらせて、新しい実戦を始める */
  start(machineId: string): SessionDetail {
    this.#assertMachine(machineId);
    const nowUs = this.#nowUs();
    const session = this.#store.transaction(() => {
      if (this.#live) this.#store.endSession(this.#live.session.id, nowUs);
      return this.#store.createSession(machineId, nowUs);
    });
    this.#live = { session, engine: new CounterEngine(this.#machines.get(machineId)) };
    this.#notify();
    return this.get(session.id) as SessionDetail;
  }

  /** 実戦の機種を変える。集計は生イベントからやり直す */
  setMachine(id: number, machineId: string): SessionDetail {
    this.#assertMachine(machineId);
    const session = this.#store.session(id);
    if (session === undefined) throw new HTTPException(404, { message: "実戦が見つかりません" });

    this.#store.setSessionMachine(id, machineId);
    if (this.#live?.session.id === id) {
      this.#live = this.#replay({ ...session, machineId });
      this.#notify();
    }
    return this.get(id) as SessionDetail;
  }

  /**
   * 新しく保存されたイベントを、進行中の実戦の集計に足す。
   * 進行中の実戦がなければ、最初のイベントの時刻から自動で始める。
   *
   * @param deviceNowUs Pico が送信した時点の時刻。チャタリング除去の確定待ちを進めるのに使う
   */
  record(events: readonly StoredEdgeEvent[], deviceNowUs: number): void {
    if (this.#live === null) {
      const first = events[0];
      if (first === undefined) return;
      const machineId = this.#store.sessions(1)[0]?.machineId ?? this.#defaultMachineId;
      const session = this.#store.createSession(machineId, first.atUs);
      this.#live = { session, engine: new CounterEngine(this.#machines.get(machineId)) };
    }

    const { session, engine } = this.#live;
    for (const event of events) {
      // 新しい実戦を始める前に起きて、あとから届いたイベントは前の実戦のもの
      if (event.atUs >= session.startedAtUs) engine.push(event);
    }
    if (deviceNowUs >= session.startedAtUs) engine.advanceTo(deviceNowUs);
    this.#notify();
  }

  /** 手で数えるもの（リーチ目など）を 1 回足す。数えられるのは進行中の実戦だけ */
  addManualCount(id: number, counterId: string): ManualCounts {
    this.#assertCountable(id, counterId);
    this.#store.addManualCount(id, counterId, this.#nowUs());
    this.#notify();
    return this.#store.manualCounts(id);
  }

  /** 手で数えたものの、最後の 1 回を取り消す（押し間違い用） */
  removeManualCount(id: number, counterId: string): ManualCounts {
    this.#assertCountable(id, counterId);
    this.#store.removeLatestManualCount(id, counterId);
    this.#notify();
    return this.#store.manualCounts(id);
  }

  #detail(session: Session, snapshot: CounterSnapshot): SessionDetail {
    return { ...session, snapshot, manualCounts: this.#store.manualCounts(session.id) };
  }

  #assertCountable(id: number, counterId: string): void {
    const live = this.#live;
    if (live?.session.id !== id) {
      if (this.#store.session(id) === undefined) throw new HTTPException(404, { message: "実戦が見つかりません" });
      throw new HTTPException(409, { message: "終わった実戦には数えられません" });
    }
    const machine = this.#machines.get(live.session.machineId);
    if (!machine.counters.some((counter) => counter.id === counterId)) {
      throw new HTTPException(400, { message: `${machine.name} には ${counterId} を数える設定がありません` });
    }
  }

  #replay(session: Session): LiveSession {
    const engine = new CounterEngine(this.#machines.get(session.machineId));
    engine.pushAll(this.#store.edges({ fromUs: session.startedAtUs, toUs: session.endedAtUs }));
    return { session, engine };
  }

  #closedSnapshot(session: Session): CounterSnapshot {
    const cacheKey = this.#machines.cacheKey(session.machineId);
    const cached = this.#store.cachedSnapshot(session.id, cacheKey);
    if (cached) return cached;

    const snapshot = this.#replay(session).engine.finish().snapshot();
    this.#store.cacheSnapshot(session.id, cacheKey, snapshot);
    return snapshot;
  }

  #assertMachine(machineId: string): void {
    if (!this.#machines.has(machineId)) {
      throw new HTTPException(400, { message: `機種 ${machineId} は登録されていません` });
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

function toSummary({ hits: _hits, slump: _slump, ...summary }: CounterSnapshot): CounterSummary {
  return summary;
}
