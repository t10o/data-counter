import type { DatabaseSync } from "node:sqlite";
import type {
  CounterSnapshot,
  DeviceReport,
  DeviceStatus,
  Edge,
  EdgeEvent,
  ManualCounts,
  Session,
  StoredEdgeEvent,
} from "@data-counter/core";
import { transaction } from "./db.ts";

export interface Boot {
  id: string;
  deviceId: string;
  /** Pico の起動からのマイクロ秒にこれを足すと、UNIX エポックからのマイクロ秒になる */
  offsetUs: number;
  firstSeenAtUs: number;
  lastSeenAtUs: number;
  /** 最後に届いた時点の、Pico の起動からのマイクロ秒 */
  lastNowUs: number;
  lastReport: DeviceReport;
}

export interface BootContact {
  id: string;
  deviceId: string;
  nowUs: number;
  seenAtUs: number;
  report: DeviceReport;
}

export type NewEdgeEvent = Omit<StoredEdgeEvent, "id">;

export interface EventRange {
  fromUs: number;
  /** 含まない。省略すると最後まで */
  toUs?: number | null | undefined;
}

type BootRow = {
  id: string;
  device_id: string;
  offset_us: number;
  first_seen_at_us: number;
  last_seen_at_us: number;
  last_now_us: number;
  last_report: string;
};

type EventRow = {
  id: number;
  boot_id: string;
  seq: number;
  pin: number;
  edge: Edge;
  t_us: number;
  at_us: number;
};

type SessionRow = {
  id: number;
  machine_id: string;
  started_at_us: number;
  ended_at_us: number | null;
};

/** SQLite の読み書きをまとめたもの。SQL はここの外に出さない */
export class Store {
  readonly #db: DatabaseSync;
  readonly #sql: Statements;

  constructor(db: DatabaseSync) {
    this.#db = db;
    this.#sql = prepareStatements(db);
  }

  transaction<T>(fn: () => T): T {
    return transaction(this.#db, fn);
  }

  /** Pico から届いたことを記録する。初めての起動なら、このときの時刻のずれを基準にする */
  saveBoot({ id, deviceId, nowUs, seenAtUs, report }: BootContact): Boot {
    const seen = { id, nowUs, seenAtUs, report: JSON.stringify(report) };
    if (this.#sql.findBoot.get(id) === undefined) {
      this.#sql.insertBoot.run({ ...seen, deviceId, offsetUs: seenAtUs - nowUs });
    } else {
      this.#sql.touchBoot.run(seen);
    }
    return toBoot(this.#sql.findBoot.get(id) as BootRow);
  }

  devices(): DeviceStatus[] {
    return (this.#sql.latestBoots.all() as BootRow[]).map((row) => toDeviceStatus(toBoot(row)));
  }

  /** イベントを保存し、新しく保存できたものだけを返す（同じ seq は 2 回保存しない） */
  insertEvents(events: readonly NewEdgeEvent[], receivedAtUs: number): StoredEdgeEvent[] {
    const inserted: StoredEdgeEvent[] = [];
    for (const event of events) {
      const row = this.#sql.insertEvent.get({ ...event, receivedAtUs }) as { id: number } | undefined;
      if (row !== undefined) inserted.push({ ...event, id: row.id });
    }
    return inserted;
  }

  maxSeq(bootId: string): number {
    return (this.#sql.maxSeq.get(bootId) as { seq: number }).seq;
  }

  events({ fromUs, toUs }: EventRange, limit: number): StoredEdgeEvent[] {
    const rows = this.#sql.events.all({ fromUs, toUs: toUs ?? Number.MAX_SAFE_INTEGER, limit });
    return (rows as EventRow[]).map(toStoredEvent);
  }

  /** 集計エンジンに流し込む用。件数が多くても全部をメモリに載せない */
  *edges({ fromUs, toUs }: EventRange): Generator<EdgeEvent> {
    const rows = this.#sql.edges.iterate({ fromUs, toUs: toUs ?? Number.MAX_SAFE_INTEGER });
    for (const row of rows as Iterable<Pick<EventRow, "pin" | "edge" | "at_us">>) {
      yield { pin: row.pin, edge: row.edge, atUs: row.at_us };
    }
  }

  openSession(): Session | undefined {
    const row = this.#sql.openSession.get() as SessionRow | undefined;
    return row && toSession(row);
  }

  session(id: number): Session | undefined {
    const row = this.#sql.session.get(id) as SessionRow | undefined;
    return row && toSession(row);
  }

  /** 新しい順 */
  sessions(limit: number): Session[] {
    return (this.#sql.sessions.all(limit) as SessionRow[]).map(toSession);
  }

  createSession(machineId: string, startedAtUs: number): Session {
    return toSession(this.#sql.insertSession.get(machineId, startedAtUs) as SessionRow);
  }

  endSession(id: number, endedAtUs: number): void {
    this.#sql.endSession.run(endedAtUs, id);
  }

  setSessionMachine(id: number, machineId: string): void {
    this.#sql.setSessionMachine.run(machineId, id);
    this.#sql.deleteSnapshot.run(id);
  }

  cachedSnapshot(sessionId: number, cacheKey: string): CounterSnapshot | undefined {
    const row = this.#sql.cachedSnapshot.get(sessionId, cacheKey) as { snapshot: string } | undefined;
    return row && (JSON.parse(row.snapshot) as CounterSnapshot);
  }

  cacheSnapshot(sessionId: number, cacheKey: string, snapshot: CounterSnapshot): void {
    this.#sql.cacheSnapshot.run(sessionId, cacheKey, JSON.stringify(snapshot));
  }

  manualCounts(sessionId: number): ManualCounts {
    const rows = this.#sql.manualCounts.all(sessionId) as { counter_id: string; count: number }[];
    return Object.fromEntries(rows.map((row) => [row.counter_id, row.count]));
  }

  addManualCount(sessionId: number, counterId: string, atUs: number): void {
    this.#sql.insertManualCount.run(sessionId, counterId, atUs);
  }

  /** いちばん最後に数えた 1 回を消す（押し間違いの取り消し）。まだ数えていなければ何もしない */
  removeLatestManualCount(sessionId: number, counterId: string): void {
    this.#sql.deleteLatestManualCount.run({ sessionId, counterId });
  }

  /** あとから届いたイベントが含まれる実戦の集計キャッシュを捨てる */
  invalidateSnapshots({ fromUs, toUs }: { fromUs: number; toUs: number }): void {
    this.#sql.deleteSnapshotsBetween.run({ fromUs, toUs });
  }
}

export function toDeviceStatus(boot: Boot): DeviceStatus {
  return {
    deviceId: boot.deviceId,
    bootId: boot.id,
    firstSeenAtUs: boot.firstSeenAtUs,
    lastSeenAtUs: boot.lastSeenAtUs,
    uptimeUs: boot.lastNowUs,
    report: boot.lastReport,
  };
}

function toBoot(row: BootRow): Boot {
  return {
    id: row.id,
    deviceId: row.device_id,
    offsetUs: row.offset_us,
    firstSeenAtUs: row.first_seen_at_us,
    lastSeenAtUs: row.last_seen_at_us,
    lastNowUs: row.last_now_us,
    lastReport: JSON.parse(row.last_report) as DeviceReport,
  };
}

function toStoredEvent(row: EventRow): StoredEdgeEvent {
  return {
    id: row.id,
    bootId: row.boot_id,
    seq: row.seq,
    pin: row.pin,
    edge: row.edge,
    tUs: row.t_us,
    atUs: row.at_us,
  };
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    machineId: row.machine_id,
    startedAtUs: row.started_at_us,
    endedAtUs: row.ended_at_us,
  };
}

type Statements = ReturnType<typeof prepareStatements>;

function prepareStatements(db: DatabaseSync) {
  return {
    findBoot: db.prepare("SELECT * FROM boots WHERE id = ?"),
    insertBoot: db.prepare(`
      INSERT INTO boots (id, device_id, offset_us, first_seen_at_us, last_seen_at_us, last_now_us, last_report)
      VALUES (:id, :deviceId, :offsetUs, :seenAtUs, :seenAtUs, :nowUs, :report)
    `),
    touchBoot: db.prepare(`
      UPDATE boots SET last_seen_at_us = :seenAtUs, last_now_us = :nowUs, last_report = :report WHERE id = :id
    `),
    latestBoots: db.prepare(`
      SELECT * FROM boots AS b
      WHERE last_seen_at_us = (SELECT MAX(last_seen_at_us) FROM boots WHERE device_id = b.device_id)
      ORDER BY device_id
    `),
    insertEvent: db.prepare(`
      INSERT INTO events (boot_id, seq, pin, edge, t_us, at_us, received_at_us)
      VALUES (:bootId, :seq, :pin, :edge, :tUs, :atUs, :receivedAtUs)
      ON CONFLICT (boot_id, seq) DO NOTHING
      RETURNING id
    `),
    maxSeq: db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE boot_id = ?"),
    events: db.prepare(`
      SELECT id, boot_id, seq, pin, edge, t_us, at_us FROM events
      WHERE at_us >= :fromUs AND at_us < :toUs
      ORDER BY at_us, id
      LIMIT :limit
    `),
    edges: db.prepare(`
      SELECT pin, edge, at_us FROM events
      WHERE at_us >= :fromUs AND at_us < :toUs
      ORDER BY at_us, id
    `),
    openSession: db.prepare("SELECT * FROM sessions WHERE ended_at_us IS NULL"),
    session: db.prepare("SELECT * FROM sessions WHERE id = ?"),
    sessions: db.prepare("SELECT * FROM sessions ORDER BY started_at_us DESC, id DESC LIMIT ?"),
    insertSession: db.prepare("INSERT INTO sessions (machine_id, started_at_us) VALUES (?, ?) RETURNING *"),
    endSession: db.prepare("UPDATE sessions SET ended_at_us = ? WHERE id = ? AND ended_at_us IS NULL"),
    setSessionMachine: db.prepare("UPDATE sessions SET machine_id = ? WHERE id = ?"),
    cachedSnapshot: db.prepare("SELECT snapshot FROM session_snapshots WHERE session_id = ? AND cache_key = ?"),
    cacheSnapshot: db.prepare(`
      INSERT INTO session_snapshots (session_id, cache_key, snapshot) VALUES (?, ?, ?)
      ON CONFLICT (session_id) DO UPDATE SET cache_key = excluded.cache_key, snapshot = excluded.snapshot
    `),
    deleteSnapshot: db.prepare("DELETE FROM session_snapshots WHERE session_id = ?"),
    manualCounts: db.prepare(`
      SELECT counter_id, COUNT(*) AS count FROM manual_counts WHERE session_id = ? GROUP BY counter_id
    `),
    insertManualCount: db.prepare("INSERT INTO manual_counts (session_id, counter_id, at_us) VALUES (?, ?, ?)"),
    deleteLatestManualCount: db.prepare(`
      DELETE FROM manual_counts WHERE id = (
        SELECT id FROM manual_counts WHERE session_id = :sessionId AND counter_id = :counterId
        ORDER BY at_us DESC, id DESC LIMIT 1
      )
    `),
    deleteSnapshotsBetween: db.prepare(`
      DELETE FROM session_snapshots WHERE session_id IN (
        SELECT id FROM sessions
        WHERE started_at_us <= :toUs AND (ended_at_us IS NULL OR ended_at_us > :fromUs)
      )
    `),
  };
}
