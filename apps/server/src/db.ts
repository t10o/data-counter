import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** 1 要素が 1 バージョン分。適用済みのバージョンは PRAGMA user_version に記録する */
const MIGRATIONS: readonly string[] = [
  `
  -- Pico の起動 1 回分。Pico の時計は起動からのマイクロ秒しか持っていないので、
  -- 最初に届いたときの受信時刻との差（offset_us）を使って実時刻に直す
  CREATE TABLE boots (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    offset_us INTEGER NOT NULL,
    first_seen_at_us INTEGER NOT NULL,
    last_seen_at_us INTEGER NOT NULL,
    last_now_us INTEGER NOT NULL,
    last_report TEXT NOT NULL DEFAULT '{}'
  ) STRICT;
  CREATE INDEX boots_device ON boots (device_id, last_seen_at_us);

  -- 端子の変化。数えたり判定したりせず、届いたものをすべて残す
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    boot_id TEXT NOT NULL REFERENCES boots (id),
    seq INTEGER NOT NULL,
    pin INTEGER NOT NULL,
    edge TEXT NOT NULL CHECK (edge IN ('fall', 'rise')),
    t_us INTEGER NOT NULL,
    at_us INTEGER NOT NULL,
    received_at_us INTEGER NOT NULL,
    UNIQUE (boot_id, seq)
  ) STRICT;
  CREATE INDEX events_at ON events (at_us);

  -- 実戦（集計の区切り）。進行中のものは 1 つだけ
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    machine_id TEXT NOT NULL,
    started_at_us INTEGER NOT NULL,
    ended_at_us INTEGER
  ) STRICT;
  CREATE UNIQUE INDEX sessions_single_open ON sessions ((ended_at_us IS NULL)) WHERE ended_at_us IS NULL;

  -- 終わった実戦の集計結果のキャッシュ。cache_key には集計エンジンと機種設定の版が入る
  CREATE TABLE session_snapshots (
    session_id INTEGER PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
    cache_key TEXT NOT NULL,
    snapshot TEXT NOT NULL
  ) STRICT;
  `,
  `
  -- 画面のボタンで手で数えたもの（リーチ目など、端子からは取れないもの）。1 行が 1 回分。
  -- 実戦の機種を付け替えても消さない（counter_id がその機種の設定になければ出さないだけ）
  CREATE TABLE manual_counts (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    counter_id TEXT NOT NULL,
    at_us INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX manual_counts_session ON manual_counts (session_id, counter_id, at_us);
  `,
];

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version] ?? "");
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
