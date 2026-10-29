import type { Level } from "./types.ts";

export interface Transition {
  level: Level;
  atUs: number;
}

/**
 * 1 本の入力からチャタリングを取り除く。
 *
 * 新しいレベルが windowUs 以上続いたときだけ変化として確定させる。
 * 確定した変化の時刻は、そのレベルになった最後の変化の時刻になる。
 * windowUs より短いパルスは、なかったものとして捨てる。
 */
export class Debouncer {
  readonly #windowUs: number;
  #level: Level;
  #pending: Transition | null = null;

  constructor(windowUs: number, initialLevel: Level = 1) {
    this.#windowUs = windowUs;
    this.#level = initialLevel;
  }

  /** 確定しているレベル */
  get level(): Level {
    return this.#level;
  }

  /** 確定待ちの変化が起きた時刻。なければ null */
  get pendingSinceUs(): number | null {
    return this.#pending?.atUs ?? null;
  }

  /** atUs 時点で確定待ちの変化を確定できるか */
  isDue(atUs: number): boolean {
    return this.#pending !== null && atUs - this.#pending.atUs >= this.#windowUs;
  }

  /**
   * 生の変化を入れる。
   * 確定できる変化が残っていると上書きしてしまうので、先に {@link advance} を呼んでおくこと。
   */
  input(level: Level, atUs: number): void {
    this.#pending = level === this.#level ? null : { level, atUs };
  }

  /** atUs 時点で確定できる変化があれば確定させて返す */
  advance(atUs: number): Transition | null {
    const pending = this.#pending;
    if (pending === null || atUs - pending.atUs < this.#windowUs) return null;
    return this.#commit(pending);
  }

  /** 入力が終わったものとして、確定待ちの変化をすぐに確定させる */
  flush(): Transition | null {
    return this.#pending === null ? null : this.#commit(this.#pending);
  }

  #commit(transition: Transition): Transition {
    this.#pending = null;
    this.#level = transition.level;
    return transition;
  }
}
