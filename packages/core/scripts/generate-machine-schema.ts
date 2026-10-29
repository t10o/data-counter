/**
 * machines/*.json のエディタ補完用に、機種設定の JSON Schema を書き出す。
 * 使い方: pnpm --filter @data-counter/core generate:schema
 */
import { writeFileSync } from "node:fs";
import { machineSchemaJson, MACHINE_SCHEMA_PATH } from "./machine-schema.ts";

writeFileSync(MACHINE_SCHEMA_PATH, machineSchemaJson());
console.info(`wrote ${MACHINE_SCHEMA_PATH}`);
