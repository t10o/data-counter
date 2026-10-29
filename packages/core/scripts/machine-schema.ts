import { fileURLToPath } from "node:url";
import { z } from "zod";
import { machineSchema } from "../src/schemas.ts";

export const MACHINE_SCHEMA_PATH = fileURLToPath(new URL("../../../machines/machine.schema.json", import.meta.url));

/** 機種設定の JSON Schema（machines/machine.schema.json の中身） */
export function machineSchemaJson(): string {
  const schema = z.toJSONSchema(machineSchema, { io: "input" });
  return `${JSON.stringify({ ...schema, title: "Data Counter machine definition" }, null, 2)}\n`;
}
