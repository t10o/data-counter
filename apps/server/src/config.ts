import { resolve } from "node:path";
import { z } from "zod";

/** リポジトリのルート。src/ から動かしても dist/ から動かしても同じ場所を指す */
const ROOT = resolve(import.meta.dirname, "../../..");

const path = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value) => resolve(value));

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3012),
  DATA_DIR: path(resolve(ROOT, "data")),
  MACHINES_DIR: path(resolve(ROOT, "machines")),
  WEB_DIR: path(resolve(ROOT, "apps/web/dist/client")),
  DEFAULT_MACHINE: z.string().min(1).default("discup2"),
  INGEST_TOKEN: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  machinesDir: string;
  webDir: string;
  defaultMachineId: string;
  ingestToken: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath: resolve(parsed.DATA_DIR, "data-counter.db"),
    machinesDir: parsed.MACHINES_DIR,
    webDir: parsed.WEB_DIR,
    defaultMachineId: parsed.DEFAULT_MACHINE,
    ingestToken: parsed.INGEST_TOKEN,
  };
}
