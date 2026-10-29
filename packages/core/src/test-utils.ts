import { machineSchema } from "./schemas.ts";
import type { EdgeEvent, MachineConfig } from "./types.ts";

export const testMachine = (overrides: Partial<Record<keyof MachineConfig, unknown>> = {}) =>
  machineSchema.parse({
    id: "test",
    name: "テスト機",
    debounceMs: 0,
    signals: [
      { pin: 4, kinds: [{ id: "big", label: "BIG", color: "red" }] },
      { pin: 3, kinds: [{ id: "reg", label: "REG", color: "blue" }] },
    ],
    ...overrides,
  });

/** 時刻を進めながら実機っぽいイベント列を作る */
export class Timeline {
  readonly events: EdgeEvent[] = [];
  #nowUs = 1_700_000_000_000_000;

  get nowUs(): number {
    return this.#nowUs;
  }

  wait(ms: number): this {
    this.#nowUs += ms * 1000;
    return this;
  }

  fall(pin: number): this {
    this.events.push({ pin, edge: "fall", atUs: this.#nowUs });
    return this;
  }

  rise(pin: number): this {
    this.events.push({ pin, edge: "rise", atUs: this.#nowUs });
    return this;
  }

  /** width ms のパルスを count 回、gap ms あけて出す */
  pulses(pin: number, count: number, { width = 40, gap = 60 } = {}): this {
    for (let i = 0; i < count; i++) {
      this.fall(pin).wait(width).rise(pin).wait(gap);
    }
    return this;
  }

  /** 1 ゲーム回す。payout 枚の払い出しがある */
  game(payout = 0): this {
    this.pulses(1, 3).wait(500);
    if (payout > 0) this.pulses(2, payout);
    return this.wait(3000);
  }

  games(count: number, payout = 0): this {
    for (let i = 0; i < count; i++) this.game(payout);
    return this;
  }
}
