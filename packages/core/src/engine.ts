import { Debouncer, type Transition } from "./debounce.ts";
import { toSlumpPoints } from "./slump.ts";
import type {
  CounterSnapshot,
  CounterSummary,
  EdgeEvent,
  Hit,
  KindStat,
  MachineConfig,
  MachineKind,
  MachineSignal,
} from "./types.ts";

/** 集計の仕方を変えたら上げる。保存してある集計結果のキャッシュを捨てるのに使う */
export const ENGINE_VERSION = 4;

const DEFAULT_MAX_SLUMP_POINTS = 1200;

export interface SnapshotOptions {
  /** スランプグラフの点の最大数。これを超えると山と谷を残して間引く */
  maxSlumpPoints?: number;
}

/**
 * 生イベントからデータカウンターの数字を組み立てる。
 *
 * - イベントは時刻順に {@link push} する
 * - ゲーム数は、レバーオンで出る IN のパルスの塊を 1 ゲームとして数える（IN 枚数を割り算しない）。
 *   ボーナス中などでベット枚数が変わっても数えられる
 * - ハマりは 2 通り数える。currentGames はゲーム数を戻す信号（resetsGames。ボーナスなど）の当たりから（ボナ間）、
 *   currentGamesAny はどの信号の当たりからでも（ボナ・ART 間）。どちらも当たりの信号が ON の間は進めない
 * - チャタリングを除くため、変化は machine.debounceMs だけ続いてから確定する。
 *   ライブで使うときは {@link advanceTo} で時間が進んだことを知らせると、次のイベントを待たずに確定する
 * - 過去のデータをまとめて集計するときは、最後に {@link finish} を呼ぶ
 */
export class CounterEngine {
  readonly machine: MachineConfig;

  readonly #debouncers = new Map<number, Debouncer>();
  readonly #signals = new Map<number, MachineSignal>();
  readonly #kinds: readonly MachineKind[];

  #in = 0;
  #out = 0;
  #totalGames = 0;
  #currentGames = 0;
  #currentGamesAny = 0;
  #maxDiff = 0;
  #minDiff = 0;
  #maxGames = 0;
  #maxGamesAny = 0;
  /** 添字のゲーム数を消化し終えた時点の差枚。消化中のゲームの分は snapshot で今の差枚を入れる */
  readonly #diffByGame: number[] = [0];
  /** 直前の IN パルスの時刻。これだけあいたら次のゲームの始まり */
  #lastInAtUs: number | null = null;
  readonly #hits: Hit[] = [];
  /** 信号が ON になっている当たり（キーはピン番号） */
  readonly #activeHits = new Map<number, Hit>();
  #firstEventAtUs: number | null = null;
  #lastEventAtUs: number | null = null;

  constructor(machine: MachineConfig) {
    this.machine = machine;
    this.#kinds = machine.signals.flatMap((signal) => signal.kinds);

    const windowUs = machine.debounceMs * 1000;
    for (const pin of [machine.pins.in, machine.pins.out]) {
      this.#debouncers.set(pin, new Debouncer(windowUs));
    }
    for (const signal of machine.signals) {
      this.#signals.set(signal.pin, signal);
      this.#debouncers.set(signal.pin, new Debouncer(windowUs));
    }
  }

  push(event: EdgeEvent): void {
    const debouncer = this.#debouncers.get(event.pin);
    // 機種設定で使っていないピン
    if (debouncer === undefined) return;

    this.#firstEventAtUs ??= event.atUs;
    this.#lastEventAtUs = event.atUs;

    this.advanceTo(event.atUs);
    debouncer.input(event.edge === "fall" ? 0 : 1, event.atUs);
    // チャタリング除去が 0 ms のときはここで確定する
    this.advanceTo(event.atUs);
  }

  pushAll(events: Iterable<EdgeEvent>): this {
    for (const event of events) this.push(event);
    return this;
  }

  /** atUs までに確定できる変化をすべて確定させる */
  advanceTo(atUs: number): void {
    this.#applyAll((debouncer) => debouncer.advance(atUs));
  }

  /** 入力が終わったものとして、確定待ちの変化をすべて確定させる */
  finish(): this {
    this.#applyAll((debouncer) => debouncer.flush());
    return this;
  }

  summary(): CounterSummary {
    const kinds: KindStat[] = this.#kinds.map((kind) => {
      const count = this.#hits.filter((hit) => hit.kindId === kind.id).length;
      return {
        id: kind.id,
        label: kind.label,
        color: kind.color,
        count,
        probability: ratio(this.#totalGames, count),
      };
    });
    const hitCount = this.#hits.filter((hit) => this.#signals.get(hit.pin)?.resetsGames).length;

    return {
      machineId: this.machine.id,
      totalGames: this.#totalGames,
      currentGames: this.#currentGames,
      currentGamesAny: this.#currentGamesAny,
      in: this.#in,
      out: this.#out,
      diff: this.#diff,
      payoutRate: this.#in === 0 ? null : this.#out / this.#in,
      maxDiff: this.#maxDiff,
      minDiff: this.#minDiff,
      maxGames: this.#maxGames,
      maxGamesAny: this.#maxGamesAny,
      kinds,
      hitCount,
      hitProbability: ratio(this.#totalGames, hitCount),
      hitCountAny: this.#hits.length,
      hitProbabilityAny: ratio(this.#totalGames, this.#hits.length),
      activePins: [...this.#activeHits.keys()],
      firstEventAtUs: this.#firstEventAtUs,
      lastEventAtUs: this.#lastEventAtUs,
    };
  }

  snapshot({ maxSlumpPoints = DEFAULT_MAX_SLUMP_POINTS }: SnapshotOptions = {}): CounterSnapshot {
    // 最後の点は、消化中のゲームの払い出しも含めた今の差枚にする
    const diffByGame = [...this.#diffByGame];
    diffByGame[this.#totalGames] = this.#diff;

    return {
      ...this.summary(),
      hits: this.#hits.map((hit) => ({ ...hit })),
      slump: toSlumpPoints(diffByGame, maxSlumpPoints),
    };
  }

  get #diff(): number {
    return this.#out - this.#in;
  }

  /** ゲーム数を戻す信号が ON の間（ボーナス中など）は、現在のゲーム数を進めない */
  get #inBonus(): boolean {
    for (const pin of this.#activeHits.keys()) {
      if (this.#signals.get(pin)?.resetsGames) return true;
    }
    return false;
  }

  #applyAll(take: (debouncer: Debouncer) => Transition | null): void {
    const transitions: { pin: number; transition: Transition }[] = [];
    for (const [pin, debouncer] of this.#debouncers) {
      const transition = take(debouncer);
      if (transition !== null) transitions.push({ pin, transition });
    }
    transitions.sort((a, b) => a.transition.atUs - b.transition.atUs);
    for (const { pin, transition } of transitions) this.#apply(pin, transition);
  }

  #apply(pin: number, { level, atUs }: Transition): void {
    // 接点が閉じる（Low になる）と ON
    const on = level === 0;

    if (pin === this.machine.pins.in) {
      if (on) this.#countIn(atUs);
      return;
    }
    if (pin === this.machine.pins.out) {
      if (on) this.#countOut();
      return;
    }

    const signal = this.#signals.get(pin);
    if (signal === undefined) return;
    if (on) {
      this.#startHit(signal, atUs);
    } else {
      this.#endHit(signal, atUs);
    }
  }

  #countIn(atUs: number): void {
    // ベット枚数分のパルスがレバーオンでまとめて出るので、前のパルスから間があいていたら新しいゲーム
    const startsGame = this.#lastInAtUs === null || atUs - this.#lastInAtUs >= this.machine.gameGapMs * 1000;
    this.#lastInAtUs = atUs;
    if (startsGame) this.#startGame();

    this.#in++;
    this.#trackDiff();
  }

  #startGame(): void {
    // 前のゲームの払い出しまで含めた差枚を、そのゲームの点にする
    this.#diffByGame[this.#totalGames] = this.#diff;
    this.#totalGames++;
    for (const hit of this.#activeHits.values()) hit.gamesDuring++;
    if (!this.#inBonus) {
      this.#currentGames++;
      this.#maxGames = Math.max(this.#maxGames, this.#currentGames);
    }
    if (this.#activeHits.size === 0) {
      this.#currentGamesAny++;
      this.#maxGamesAny = Math.max(this.#maxGamesAny, this.#currentGamesAny);
    }
  }

  #countOut(): void {
    this.#out++;
    this.#trackDiff();
    for (const hit of this.#activeHits.values()) hit.out++;
  }

  #trackDiff(): void {
    this.#maxDiff = Math.max(this.#maxDiff, this.#diff);
    this.#minDiff = Math.min(this.#minDiff, this.#diff);
  }

  #startHit(signal: MachineSignal, atUs: number): void {
    // 種別が 1 つなら ON になった時点で決まる。複数なら OFF になるまで決められない
    const kind = signal.kinds.length === 1 ? signal.kinds[0] : undefined;
    const hit: Hit = {
      index: this.#hits.length + 1,
      pin: signal.pin,
      kindId: kind?.id ?? null,
      label: kind?.label ?? signal.label ?? signal.kinds.map((k) => k.label).join("/"),
      color: kind?.color ?? "gray",
      startedAtUs: atUs,
      endedAtUs: null,
      games: this.#currentGames,
      gamesAny: this.#currentGamesAny,
      totalGames: this.#totalGames,
      diff: this.#diff,
      out: 0,
      gamesDuring: 0,
    };
    this.#hits.push(hit);
    this.#activeHits.set(signal.pin, hit);
    this.#currentGamesAny = 0;
    if (signal.resetsGames) this.#currentGames = 0;
  }

  #endHit(signal: MachineSignal, atUs: number): void {
    const hit = this.#activeHits.get(signal.pin);
    // 集計を始める前から ON だった信号
    if (hit === undefined) return;

    this.#activeHits.delete(signal.pin);
    hit.endedAtUs = atUs;
    if (hit.kindId === null) {
      const kind = classify(signal, hit.out);
      hit.kindId = kind.id;
      hit.label = kind.label;
      hit.color = kind.color;
    }
  }
}

/** 信号が ON の間の払い出し枚数から種別を決める（BIG と REG が同じピンから出る機種向け） */
function classify(signal: MachineSignal, out: number): MachineKind {
  const kind = signal.kinds.find((k) => k.maxOut === undefined || out <= k.maxOut);
  // どの maxOut も超えたら最後の種別にする。kinds が 1 つ以上あることは schemas.ts で検証済み
  return kind ?? (signal.kinds.at(-1) as MachineKind);
}

function ratio(games: number, count: number): number | null {
  return count === 0 ? null : games / count;
}
