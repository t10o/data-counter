import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { Ingestor } from "./ingest.ts";
import { LiveFeed } from "./live-feed.ts";
import { MachineRegistry } from "./machines.ts";
import { SessionService } from "./sessions.ts";
import { Store } from "./store.ts";

const config = loadConfig();

const machines = MachineRegistry.load(config.machinesDir);
if (!machines.has(config.defaultMachineId)) {
  throw new Error(`DEFAULT_MACHINE=${config.defaultMachineId} が ${config.machinesDir} にありません`);
}

const db = openDatabase(config.databasePath);
const store = new Store(db);
const sessions = new SessionService(store, machines, { defaultMachineId: config.defaultMachineId });
const ingestor = new Ingestor(store, sessions);
const feed = new LiveFeed(sessions, ingestor);

const app = createApp({
  store,
  machines,
  sessions,
  ingestor,
  feed,
  ingestToken: config.ingestToken,
  webDir: config.webDir,
});

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.info(`data-counter listening on http://${info.address}:${info.port}`);
  console.info(`database: ${config.databasePath}`);
  console.info(
    `machines: ${machines
      .list()
      .map((machine) => machine.id)
      .join(", ")}`,
  );
});

if (config.ingestToken === undefined) {
  console.warn("INGEST_TOKEN が未設定なので、同じネットワークの誰でもイベントを送れます");
}

function shutdown(signal: NodeJS.Signals): void {
  console.info(`${signal} received, shutting down`);
  feed.close();
  server.close();
  // 処理はすべて同期なので、ここで閉じても書きかけのトランザクションは残らない
  db.close();
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
