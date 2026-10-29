import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSION, type MachineConfig } from "@data-counter/core";
import { machineSchema } from "@data-counter/core/schemas";
import { z } from "zod";

/** machines/*.json から読み込んだ機種設定 */
export class MachineRegistry {
  readonly #machines: ReadonlyMap<string, MachineConfig>;

  constructor(machines: Iterable<MachineConfig>) {
    this.#machines = new Map([...machines].map((machine) => [machine.id, machine]));
  }

  static load(dir: string): MachineRegistry {
    const files = readdirSync(dir).filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json"));
    return new MachineRegistry(
      files.map((file) => {
        const result = machineSchema.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
        if (!result.success) {
          throw new Error(`機種設定 ${file} が正しくありません\n${z.prettifyError(result.error)}`);
        }
        return result.data;
      }),
    );
  }

  list(): MachineConfig[] {
    return [...this.#machines.values()].toSorted((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  has(id: string): boolean {
    return this.#machines.has(id);
  }

  /** 設定ファイルが消えた機種でも数字だけは出せるよう、見つからなければ信号なしの機種として扱う */
  get(id: string): MachineConfig {
    return this.#machines.get(id) ?? machineSchema.parse({ id, name: id, signals: [] });
  }

  /** 集計エンジンか機種設定が変わると変わる値。集計結果のキャッシュのキーに使う */
  cacheKey(id: string): string {
    const hash = createHash("sha256")
      .update(JSON.stringify(this.get(id)))
      .digest("hex");
    return `${ENGINE_VERSION}:${hash.slice(0, 16)}`;
  }
}
