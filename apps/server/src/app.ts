import { existsSync } from "node:fs";
import type { StreamMessage } from "@data-counter/core";
import { ingestRequestSchema, startSessionRequestSchema, updateSessionRequestSchema } from "@data-counter/core/schemas";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Ingestor } from "./ingest.ts";
import type { LiveFeed } from "./live-feed.ts";
import type { MachineRegistry } from "./machines.ts";
import type { SessionService } from "./sessions.ts";
import type { Store } from "./store.ts";

export interface AppDependencies {
  store: Store;
  machines: MachineRegistry;
  sessions: SessionService;
  ingestor: Ingestor;
  feed: LiveFeed;
  /** 設定すると、Pico からの送信に Bearer トークンを求める */
  ingestToken?: string | undefined;
  /** 画面のビルド結果（apps/web/dist/client）。なければ API だけを出す */
  webDir?: string | undefined;
}

/** 接続が切られないよう、何もなくてもこの間隔で空行を送る */
const KEEPALIVE_MS = 20_000;
/** TanStack Start の SPA モードが書き出すシェル。知らないパスはすべてこれを返す */
const SPA_SHELL = "_shell.html";

const idSchema = z.coerce.number().int().positive();
const sessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const eventsQuerySchema = z.object({
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50_000).default(10_000),
});

export function createApp(deps: AppDependencies): Hono {
  const { store, machines, sessions, ingestor, feed } = deps;
  const api = new Hono();

  if (deps.ingestToken) api.use("/ingest", bearerAuth({ token: deps.ingestToken }));
  api.post("/ingest", bodyLimit({ maxSize: 256 * 1024 }), async (c) =>
    c.json(ingestor.ingest(await parseBody(c, ingestRequestSchema))),
  );

  api.get("/machines", (c) => c.json(machines.list()));

  api.get("/sessions", (c) => {
    const { limit } = parse(sessionsQuerySchema, c.req.query());
    return c.json(sessions.list(limit));
  });
  api.get("/sessions/current", (c) => c.json(sessions.current()));
  api.get("/sessions/:id", (c) => {
    const session = sessions.get(parse(idSchema, c.req.param("id")));
    if (session === null) throw new HTTPException(404, { message: "実戦が見つかりません" });
    return c.json(session);
  });
  api.post("/sessions", async (c) => {
    const { machineId } = await parseBody(c, startSessionRequestSchema);
    return c.json(sessions.start(machineId), 201);
  });
  api.patch("/sessions/:id", async (c) => {
    const id = parse(idSchema, c.req.param("id"));
    const { machineId } = await parseBody(c, updateSessionRequestSchema);
    return c.json(sessions.setMachine(id, machineId));
  });

  api.get("/events", (c) => {
    const { from, to, limit } = parse(eventsQuerySchema, c.req.query());
    return c.json(store.events({ fromUs: from, toUs: to }, limit));
  });

  api.get("/devices", (c) => c.json(store.devices()));

  api.get("/stream", (c) =>
    streamSSE(c, async (stream) => {
      const send = (message: StreamMessage) =>
        stream.writeSSE({ event: message.type, data: JSON.stringify(message.data) });

      const initial: StreamMessage[] = [
        ...feed.initialMessages(),
        ...store.devices().map((device) => ({ type: "device" as const, data: device })),
      ];
      // 書き込みは呼んだ順に並ぶので、まとめて待ってよい
      await Promise.all(initial.map(send));

      const unsubscribe = feed.subscribe((message) => {
        send(message).catch(() => unsubscribe());
      });
      const keepalive = setInterval(() => {
        stream.write(": keepalive\n\n").catch(() => clearInterval(keepalive));
      }, KEEPALIVE_MS);

      // 画面が閉じられるまでつなぎっぱなしにする
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          clearInterval(keepalive);
          resolve();
        });
      });
    }),
  );

  api.all("*", () => {
    throw new HTTPException(404, { message: "Not Found" });
  });

  const app = new Hono();
  app.route("/api", api);
  app.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "サーバーでエラーが起きました" }, 500);
  });

  if (deps.webDir && existsSync(deps.webDir)) {
    const root = deps.webDir;
    app.use(
      "*",
      serveStatic({
        root,
        onFound: (path, c) => {
          // ファイル名にハッシュが付いているものは、ずっとキャッシュしてよい
          c.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    app.get("*", serveStatic({ root, path: SPA_SHELL, onFound: (_, c) => c.header("Cache-Control", "no-cache") }));
  }

  return app;
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HTTPException(400, { message: z.prettifyError(result.error) });
  return result.data;
}

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "本文が JSON ではありません" });
  }
  return parse(schema, body);
}
