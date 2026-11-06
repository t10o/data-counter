import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  CELEBRATION_DURATION_MS,
  celebrationQueue,
  celebrationSettings,
  hitKey,
  toCelebration,
  useCelebrationSettings,
  useCurrentCelebration,
} from "../../lib/celebration";
import { fanfare } from "../../lib/fanfare";
import { currentSessionQuery, machinesQuery } from "../../lib/queries";
import { CelebrationEffect } from "./celebration-effect";

/**
 * 当たりの演出。どのページを開いていても、進行中の実戦で新しい当たりが始まったら出す。
 * __root.tsx に 1 つだけ置く
 */
export function CelebrationLayer() {
  useHitCelebrations();
  useAudioUnlock();
  const current = useCurrentCelebration();
  const { effects } = useCelebrationSettings();

  useEffect(() => {
    if (current === undefined) return;
    // 鳴らしている途中で音の設定を変えても、出し直さない
    const stop = celebrationSettings.get().sound ? fanfare.play(current.kind) : null;
    const dismiss = () => celebrationQueue.dismiss(current.id);
    const timer = setTimeout(dismiss, CELEBRATION_DURATION_MS[current.kind]);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      stop?.();
    };
  }, [current]);

  if (current === undefined || !effects) return null;
  return (
    <CelebrationEffect key={current.id} celebration={current} onDismiss={() => celebrationQueue.dismiss(current.id)} />
  );
}

/**
 * 当たりがこれより前に始まっていたら演出しない（ミリ秒ではなくマイクロ秒）。
 * Wi-Fi が切れていた間の当たりや、シミュレーターの過去の分がまとめて届いたときに、古い当たりで騒がないため
 */
const FRESH_US = 60_000_000;

/** 進行中の実戦に新しい当たりが増えたら、演出の順番待ちに入れる */
function useHitCelebrations(): void {
  const { data: session } = useQuery(currentSessionQuery());
  const { data: machines } = useQuery(machinesQuery());
  /** 演出するかどうかを決め終えた当たり。画面を開いた時点ですでにあった当たりは演出しない */
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // まだ読み込み中
    if (session === undefined) return;
    const hits = session?.snapshot.hits ?? [];
    const seen = seenRef.current;
    if (seen === null) {
      seenRef.current = new Set(hits.map(hitKey));
      return;
    }

    const { effects, sound } = celebrationSettings.get();
    // 時刻は Pico から届いたイベントの時刻で比べる（タブレットの時計がずれていても困らない）
    const latestUs = session?.snapshot.lastEventAtUs ?? 0;
    const machine = machines?.find((m) => m.id === session?.machineId);
    for (const hit of hits) {
      const key = hitKey(hit);
      if (seen.has(key)) continue;
      seen.add(key);
      if ((effects || sound) && latestUs - hit.startedAtUs <= FRESH_US) {
        celebrationQueue.push(toCelebration(hit, machine));
      }
    }
  }, [session, machines]);
}

/**
 * 音をオンにしているときは、画面を触るたびに音を出せる状態にしておく。
 * ブラウザは触った流れの中でしか音を出させてくれず、裏に回ると止められることもあるため
 */
function useAudioUnlock(): void {
  const { sound } = useCelebrationSettings();

  useEffect(() => {
    if (!sound) return;
    const unlock = () => {
      if (!fanfare.ready()) fanfare.unlock();
    };
    // タッチは pointerdown ではまだ「触った」とみなされないので、指を離したとき（pointerup）に呼ぶ
    const events = ["pointerup", "keydown"] as const;
    for (const type of events) document.addEventListener(type, unlock, { capture: true });
    return () => {
      for (const type of events) document.removeEventListener(type, unlock, { capture: true });
    };
  }, [sound]);
}
