import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { machineSchemaJson, MACHINE_SCHEMA_PATH } from "../scripts/machine-schema.ts";
import { machineSchema } from "../src/schemas.ts";

const machinesDir = join(import.meta.dirname, "../../../machines");
const machineFiles = readdirSync(machinesDir).filter(
  (file) => file.endsWith(".json") && file !== "machine.schema.json",
);

describe("machines/", () => {
  it.each(machineFiles)("%s is a valid machine definition", (file) => {
    const json: unknown = JSON.parse(readFileSync(join(machinesDir, file), "utf8"));
    const machine = machineSchema.parse(json);

    expect(`${machine.id}.json`).toBe(file);
  });

  it("machine.schema.json is up to date (run `pnpm --filter @data-counter/core generate:schema`)", () => {
    expect(readFileSync(MACHINE_SCHEMA_PATH, "utf8")).toBe(machineSchemaJson());
  });
});

describe("machineSchema", () => {
  it("rejects a shared signal whose earlier kinds have no maxOut", () => {
    const result = machineSchema.safeParse({
      id: "broken",
      name: "壊れた設定",
      signals: [
        {
          pin: 4,
          kinds: [
            { id: "reg", label: "REG" },
            { id: "big", label: "BIG" },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a debounce long enough to swallow IN / OUT pulses", () => {
    const base = { id: "slow", name: "長すぎるチャタリング除去", signals: [] };

    expect(machineSchema.safeParse({ ...base, debounceMs: 49 }).success).toBe(true);
    expect(machineSchema.safeParse({ ...base, debounceMs: 50 }).success).toBe(false);
  });

  it("rejects the relay common pin and duplicated pins", () => {
    const base = { id: "broken", name: "壊れた設定" };

    expect(machineSchema.safeParse({ ...base, signals: [{ pin: 6, kinds: [{ id: "a", label: "A" }] }] }).success).toBe(
      false,
    );
    expect(machineSchema.safeParse({ ...base, signals: [{ pin: 1, kinds: [{ id: "a", label: "A" }] }] }).success).toBe(
      false,
    );
  });
});
