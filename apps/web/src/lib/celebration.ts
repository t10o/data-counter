import type { Hit, KindColor, MachineConfig, MachineSignal } from "@data-counter/core";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { hasArtGames } from "./machine";

/**
 * 当たりの演出の種類。ゲーム数を戻す信号（resetsGames。ボーナスなど）は bonus、
 * 戻さない信号（ART のセットなど）は art にする
 */
export type CelebrationKind = "bonus" | "art";

/** 演出を出しておく時間（ミリ秒）。ファンファーレ（lib/fanfare.ts）が鳴り終わってから少し余韻を残す */
export const CELEBRATION_DURATION_MS: Readonly<Record<CelebrationKind, number>> = { bonus: 5500, art: 5000 };

/** 当たりの演出 1 回分 */
export interface Celebration {
  id: string;
  kind: CelebrationKind;
  /** 当たりの表示名（BIG・REG・CM・HI-EVO など）。種別が決まる前は信号の表示名（BONUS など） */
  label: string;
  color: KindColor;
  /** 当選したときのハマり。「ボナ間 123G」のように出す。出さないときは null */
  games: { label: string | null; count: number } | null;
}

const celebrationKind = (signal: MachineSignal | undefined): CelebrationKind =>
  signal?.resetsGames === false ? "art" : "bonus";

/** 当たりを演出にする。機種がわからなければボーナスとして扱う */
export function toCelebration(hit: Hit, machine: MachineConfig | undefined): Celebration {
  const kind = celebrationKind(machine?.signals.find((signal) => signal.pin === hit.pin));
  return {
    id: hitKey(hit),
    kind,
    label: hit.label,
    color: hit.color,
    games:
      kind === "bonus"
        ? { label: hasArtGames(machine) ? "ボナ間" : null, count: hit.games }
        : // ART のセットが続いたときは 0G になるので出さない
          hit.gamesAny > 0
          ? { label: "ボナ・ART間", count: hit.gamesAny }
          : null,
  };
}

/** 当たりを見分けるキー。機種を付け替えて数え直しても、ピンと始まった時刻は変わらない */
export const hitKey = (hit: Hit): string => `${hit.pin}:${hit.startedAtUs}`;

// ---- 設定（このブラウザだけに覚えておく） ----

export interface CelebrationSettings {
  /** 画面いっぱいの演出 */
  effects: boolean;
  /** ファンファーレ */
  sound: boolean;
}

const STORAGE_KEY = "data-counter:celebration";
const DEFAULT_SETTINGS: CelebrationSettings = { effects: true, sound: true };
/** 保存してある設定。足りない項目や壊れた値は既定に戻す */
const storedSettingsSchema = z
  .object({
    effects: z.boolean().catch(DEFAULT_SETTINGS.effects),
    sound: z.boolean().catch(DEFAULT_SETTINGS.sound),
  })
  .catch(DEFAULT_SETTINGS);

class SettingsStore {
  #settings: CelebrationSettings | null = null;
  readonly #listeners = new Set<() => void>();

  get = (): CelebrationSettings => {
    this.#settings ??= readStorage();
    return this.#settings;
  };

  update(patch: Partial<CelebrationSettings>): void {
    this.#settings = { ...this.get(), ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#settings));
    } catch {
      // プライベートブラウズなどで保存できなくても、開いている間は効く
    }
    for (const listener of this.#listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
}

function readStorage(): CelebrationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return storedSettingsSchema.parse(raw === null ? {} : JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const celebrationSettings = new SettingsStore();

export function useCelebrationSettings(): CelebrationSettings {
  return useSyncExternalStore(celebrationSettings.subscribe, celebrationSettings.get, () => DEFAULT_SETTINGS);
}

// ---- 演出の順番待ち ----

/** 一度にためておく演出の数。これより多く届いたら捨てる */
const MAX_QUEUE = 4;

/** 演出は 1 つずつ出す。先頭が今出している演出 */
class CelebrationQueue {
  #queue: readonly Celebration[] = [];
  readonly #listeners = new Set<() => void>();

  current = (): Celebration | undefined => this.#queue[0];

  push(celebration: Celebration): void {
    if (this.#queue.length >= MAX_QUEUE || this.#queue.some((c) => c.id === celebration.id)) return;
    this.#queue = [...this.#queue, celebration];
    this.#emit();
  }

  dismiss(id: string): void {
    const next = this.#queue.filter((c) => c.id !== id);
    if (next.length === this.#queue.length) return;
    this.#queue = next;
    this.#emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const celebrationQueue = new CelebrationQueue();

export function useCurrentCelebration(): Celebration | undefined {
  return useSyncExternalStore(celebrationQueue.subscribe, celebrationQueue.current, () => undefined);
}
