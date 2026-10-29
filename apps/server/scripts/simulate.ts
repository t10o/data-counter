/**
 * Pico の代わりに、それらしいイベントをサーバーに送る（画面の開発用）。
 *
 *   pnpm simulate                       # いまから実時間で回し続ける
 *   pnpm simulate --history 3000        # 3000 ゲーム分を過去の出来事として一気に送ってから、実時間で続ける
 *   pnpm simulate --history 3000 --once # 一気に送って終わる
 *
 * 出目は適当なモデルで、実機の確率とは関係ない。
 */
import { parseArgs } from "node:util";
import type { IngestRequest, IngestResponse } from "@data-counter/core";

const { values: options } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3012/api/ingest" },
    token: { type: "string", default: process.env.INGEST_TOKEN ?? "" },
    history: { type: "string", default: "0" },
    seed: { type: "string", default: String(Date.now()) },
    once: { type: "boolean", default: false },
  },
});

const IN = 1;
const OUT = 2;
const REG = 3;
const BIG = 4;

type Event = IngestRequest["events"][number];

/** 再現できるよう、種を決められる乱数 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1 ゲームずつ、起動からのマイクロ秒付きでイベントを作る */
class FakeMachine {
  readonly #random: () => number;
  #seq = 0;
  #tUs = 2_000_000;
  #bonus: { pin: number; gamesLeft: number } | null = null;

  constructor(seed: number) {
    this.#random = mulberry32(seed);
  }

  get tUs(): number {
    return this.#tUs;
  }

  game(): Event[] {
    const events: Event[] = [];
    const pulses = (pin: number, count: number, widthMs: number, gapMs: number) => {
      for (let i = 0; i < count; i++) {
        events.push([++this.#seq, pin, 0, this.#tUs]);
        this.#tUs += widthMs * 1000;
        events.push([++this.#seq, pin, 1, this.#tUs]);
        this.#tUs += gapMs * 1000;
      }
    };
    const wait = (ms: number) => {
      this.#tUs += Math.round(ms * 1000);
    };

    pulses(IN, 3, 35, 70);
    wait(900 + this.#random() * 600);

    if (this.#bonus) {
      pulses(OUT, this.#bonus.pin === BIG ? 9 : 10, 45, 75);
      this.#bonus.gamesLeft--;
      if (this.#bonus.gamesLeft === 0) {
        events.push([++this.#seq, this.#bonus.pin, 1, this.#tUs]);
        this.#bonus = null;
      }
    } else {
      const roll = this.#random();
      if (roll < 1 / 7) pulses(OUT, 8, 45, 75);
      else if (roll < 1 / 7 + 1 / 40) pulses(OUT, 2, 45, 75);

      const lottery = this.#random();
      const pin = lottery < 1 / 280 ? BIG : lottery < 1 / 280 + 1 / 390 ? REG : null;
      if (pin !== null) {
        wait(2000);
        events.push([++this.#seq, pin, 0, this.#tUs]);
        this.#bonus = { pin, gamesLeft: pin === BIG ? 25 : 10 };
      }
    }

    wait(2200 + this.#random() * 800);
    return events;
  }
}

class Sender {
  readonly #boot = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  #pending: Event[] = [];

  push(events: Event[]): void {
    this.#pending.push(...events);
  }

  /** たまっているイベントを、1 回 1000 件以内に分けて送る */
  async flush(nowUs: number): Promise<void> {
    do {
      const events = this.#pending.slice(0, 1000);
      const body: IngestRequest = {
        device: "simulator",
        boot: this.#boot,
        now: nowUs,
        events,
        remaining: this.#pending.length - events.length,
        status: { rssi: -48, memFree: 150_000, dropped: 0, levels: [] },
      };
      const response = await fetch(options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      const { ack } = (await response.json()) as IngestResponse;
      this.#pending = this.#pending.filter(([seq]) => seq > ack);
    } while (this.#pending.length > 0);
  }
}

const machine = new FakeMachine(Number(options.seed));
const sender = new Sender();

// 過去の分は、Pico が Wi-Fi につながる前にためていたイベントとして送る
const historyGames = Number(options.history);
for (let i = 0; i < historyGames; i++) sender.push(machine.game());
await sender.flush(machine.tUs);
if (historyGames > 0) console.info(`sent ${historyGames} games of history`);
if (options.once) process.exit(0);

console.info(`simulating against ${options.url} (Ctrl-C to stop)`);
const deviceStartUs = machine.tUs;
const realStartMs = Date.now();
const deviceNow = () => deviceStartUs + (Date.now() - realStartMs) * 1000;

let upcoming = machine.game();
for (;;) {
  // 次のゲームのイベントのうち、時刻が来たものだけを送る
  const due = upcoming.filter(([, , , tUs]) => tUs <= deviceNow());
  upcoming = upcoming.slice(due.length);
  if (upcoming.length === 0) upcoming = machine.game();
  sender.push(due);
  await sender.flush(deviceNow());
  await new Promise((resolve) => setTimeout(resolve, 100));
}
