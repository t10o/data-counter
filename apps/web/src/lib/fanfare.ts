import { useSyncExternalStore } from "react";
import type { CelebrationKind } from "./celebration";

/**
 * 当たりの演出で鳴らすファンファーレ。音源ファイルは使わず、Web Audio でその場で合成する
 * （公開リポジトリに音源を置かずに済み、読み込みも待たない）。
 * 画面の演出（celebration.css）のタイミングは、ここの打撃音の時刻に合わせてある。
 *
 * ブラウザは、画面を一度触るまで音を出させてくれない（自動再生の制限）。
 * 触ったときに {@link FanfarePlayer.unlock} を呼んでおけば、それ以降は当たりの瞬間に鳴らせる。
 * 再読み込みしたら、また一度触る必要がある
 */
class FanfarePlayer {
  #context: AudioContext | null = null;
  #output: AudioNode | null = null;
  #noise: AudioBuffer | null = null;
  readonly #listeners = new Set<() => void>();

  /** 今すぐ音を出せるか */
  ready = (): boolean => this.#context?.state === "running";

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** 音を出せるようにする。画面を触ったときのイベントの中で呼ばないと効かない */
  unlock(): void {
    if (typeof AudioContext === "undefined") return;
    const context = this.#context ?? this.#createContext();
    if (context.state === "running") return;

    void context.resume().catch(() => {});
    // iOS Safari の古い版は、触った流れの中で実際に何か鳴らさないと解除されない
    const silence = context.createBufferSource();
    silence.buffer = context.createBuffer(1, 1, context.sampleRate);
    silence.connect(context.destination);
    silence.start();
  }

  /** 演出の音を鳴らす。返した関数を呼ぶと、途中でもすっと小さくして止める */
  play(kind: CelebrationKind): () => void {
    const context = this.#context;
    if (context === null || this.#output === null || this.#noise === null || context.state !== "running") {
      return () => {};
    }
    const bus = context.createGain();
    bus.connect(this.#output);
    SCORES[kind](new Score(context, bus, this.#noise, context.currentTime + 0.03));

    return () => {
      const now = context.currentTime;
      bus.gain.setValueAtTime(1, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => bus.disconnect(), 400);
    };
  }

  #createContext(): AudioContext {
    const context = new AudioContext();
    context.addEventListener("statechange", () => {
      for (const listener of this.#listeners) listener();
    });
    // 音を重ねても割れないよう、全体にコンプレッサーをかける
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 6;
    const master = context.createGain();
    master.gain.value = VOLUME;
    master.connect(compressor).connect(context.destination);

    this.#context = context;
    this.#output = master;
    this.#noise = createNoise(context);
    return context;
  }
}

export const fanfare = new FanfarePlayer();

/** ファンファーレを今すぐ鳴らせるか（画面をまだ触っていなければ false） */
export function useFanfareReady(): boolean {
  return useSyncExternalStore(fanfare.subscribe, fanfare.ready, () => false);
}

/** 全体の音量（0〜1） */
const VOLUME = 0.6;

// ---- 曲 ----

/**
 * ボーナス：金管のファンファーレ。「タタタ・ターン」を C と B♭ の和音で 2 回繰り返し、
 * 駆け上がって C の和音で伸ばす。打撃音は 0.33 秒・1.13 秒・1.85 秒
 */
function bonusFanfare(s: Score): void {
  const triplet = 0.11;
  const phrase = (start: number, pickup: NoteName, target: NoteName, chord: NoteName[], bass: NoteName) => {
    for (let i = 0; i < 3; i++) s.note(pickup, start + i * triplet, 0.07, BRASS, 0.15);
    const hit = start + 3 * triplet;
    s.note(target, hit, 0.38, BRASS, 0.17);
    s.chord(chord, hit, 0.38, BRASS, 0.06);
    s.note(bass, hit, 0.38, BASS, 0.16);
    s.boom(hit, { from: 110, to: 55, duration: 0.45, gain: 0.5 });
    s.noise(hit, 0.9, { filter: "highpass", from: 5000, gain: 0.12 });
  };
  phrase(0, "G4", "C5", ["E4", "G4"], "C3");
  phrase(0.8, "A4", "D5", ["F4", "Bb4"], "Bb2");

  // 駆け上がり。スネアのロールを添える
  const runStart = 1.55;
  (["B4", "C5", "D5", "E5", "F5"] as const).forEach((note, i) => s.note(note, runStart + i * 0.055, 0.05, BRASS, 0.14));
  for (let i = 0; i < 6; i++) {
    s.noise(runStart + i * 0.05, 0.05, { filter: "bandpass", from: 2500, q: 0.8, gain: 0.08 + i * 0.02 });
  }

  const end = 1.85;
  s.note("G5", end, 1.6, BRASS, 0.17);
  s.chord(["C4", "E4", "G4", "C5", "E5"], end, 1.6, BRASS, 0.055);
  s.note("C3", end, 1.6, BASS, 0.16);
  s.note("C2", end, 1.6, BASS, 0.12);
  s.boom(end, { from: 100, to: 45, duration: 1, gain: 0.7 });
  s.noise(end, 2, { filter: "highpass", from: 4000, gain: 0.16 });
}

/**
 * ART：上がっていく効果音でためてから、打撃音と同時にシンセのアルペジオ（Am → F → G → E）で駆け抜け、
 * A の和音で決める。打撃音は 0.7 秒と 2.12 秒
 */
function artJingle(s: Score): void {
  const impact = 0.7;
  s.noise(0, impact, { filter: "bandpass", from: 400, to: 7000, q: 1.5, gain: 0.25, swell: true });
  s.sweep(0, impact, "A2", "A5", 0.08);

  s.boom(impact, { from: 160, to: 40, duration: 0.8, gain: 0.85 });
  s.noise(impact, 1.4, { filter: "highpass", from: 3000, gain: 0.18 });
  s.chord(["A2", "E3", "A3", "E4"], impact, 0.2, STAB, 0.09);

  const sixteenth = 0.075;
  const groups: { bass: NoteName; notes: NoteName[] }[] = [
    { bass: "A2", notes: ["A4", "E5", "A5", "E5"] },
    { bass: "F2", notes: ["F4", "C5", "F5", "C5"] },
    { bass: "G2", notes: ["G4", "D5", "G5", "D5"] },
    { bass: "E2", notes: ["E4", "B4", "E5", "G#5"] },
  ];
  const arpeggioStart = impact + 0.22;
  groups.forEach(({ bass, notes }, group) => {
    const start = arpeggioStart + group * 4 * sixteenth;
    s.note(bass, start, 4 * sixteenth - 0.02, BASS, 0.16);
    s.boom(start, { from: 120, to: 50, duration: 0.22, gain: 0.45 });
    notes.forEach((note, i) => s.note(note, start + i * sixteenth, sixteenth * 0.8, PLUCK, 0.09));
    s.noise(start + 2 * sixteenth, 0.04, { filter: "highpass", from: 8000, gain: 0.07 });
  });

  const end = arpeggioStart + groups.length * 4 * sixteenth;
  s.chord(["A3", "C#4", "E4", "A4", "C#5", "E5"], end, 1.3, STAB, 0.06);
  s.note("A2", end, 1.3, BASS, 0.16);
  s.boom(end, { from: 140, to: 40, duration: 0.9, gain: 0.8 });
  s.noise(end, 1.8, { filter: "highpass", from: 3500, gain: 0.16 });
  (["A5", "C#6", "E6", "A6"] as const).forEach((note, i) => s.note(note, end + i * 0.05, 0.25, PLUCK, 0.05));
}

const SCORES: Record<CelebrationKind, (score: Score) => void> = { bonus: bonusFanfare, art: artJingle };

// ---- 音色 ----

interface Voice {
  /** 重ねる波形。少しずつ音程をずらして厚みを出す */
  waves: readonly OscillatorType[];
  /** 重ねた波形の音程の広がり（セント） */
  detune: number;
  attack: number;
  decay: number;
  /** 伸ばしている間の音量（最大に対する割合） */
  sustain: number;
  release: number;
  /** ローパスフィルターの周波数 [鳴り始め, 開いたとき, 伸ばしている間] */
  filter: readonly [number, number, number];
  /** 長い音にビブラートをかける */
  vibrato?: boolean;
}

const BRASS: Voice = {
  waves: ["sawtooth", "sawtooth"],
  detune: 14,
  attack: 0.03,
  decay: 0.2,
  sustain: 0.75,
  release: 0.12,
  filter: [500, 4000, 2200],
  vibrato: true,
};

const PLUCK: Voice = {
  waves: ["square"],
  detune: 0,
  attack: 0.004,
  decay: 0.12,
  sustain: 0,
  release: 0.05,
  filter: [6000, 6000, 1500],
};

const STAB: Voice = {
  waves: ["sawtooth", "square", "sawtooth"],
  detune: 12,
  attack: 0.01,
  decay: 0.3,
  sustain: 0.6,
  release: 0.3,
  filter: [300, 6000, 1800],
  vibrato: true,
};

const BASS: Voice = {
  waves: ["sawtooth"],
  detune: 0,
  attack: 0.005,
  decay: 0.15,
  sustain: 0.5,
  release: 0.08,
  filter: [200, 1400, 500],
};

// ---- 音を並べる道具 ----

type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type NoteName = `${Letter}${"" | "#" | "b"}${1 | 2 | 3 | 4 | 5 | 6 | 7}`;

const SEMITONES: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 音名（G4、C#5、Bb2 など）を周波数にする。A4 = 440 Hz */
function hz(name: NoteName): number {
  const letter = name[0] as Letter;
  const accidental = name.length === 3 ? name[1] : "";
  const octave = Number(name.at(-1));
  const midi = (octave + 1) * 12 + SEMITONES[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const NOISE_SECONDS = 2;

function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface NoiseOptions {
  filter: BiquadFilterType;
  from: number;
  /** フィルターの周波数をここまで動かす */
  to?: number;
  q?: number;
  gain: number;
  /** だんだん大きくする（上がっていく効果音）。既定はすぐ減っていく（シンバルなど） */
  swell?: boolean;
}

/** 曲の頭からの秒で音を置いていく */
class Score {
  readonly #context: AudioContext;
  readonly #output: AudioNode;
  readonly #noise: AudioBuffer;
  readonly #start: number;

  constructor(context: AudioContext, output: AudioNode, noise: AudioBuffer, start: number) {
    this.#context = context;
    this.#output = output;
    this.#noise = noise;
    this.#start = start;
  }

  note(note: NoteName, t: number, duration: number, voice: Voice, gain: number): void {
    const context = this.#context;
    const start = this.#start + t;
    const end = start + Math.max(duration, voice.attack);
    const [filterFrom, filterPeak, filterHold] = voice.filter;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(filterPeak, start + voice.attack + 0.02);
    filter.frequency.setTargetAtTime(filterHold, start + voice.attack + 0.02, voice.decay);

    const amp = context.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + voice.attack);
    amp.gain.setTargetAtTime(gain * voice.sustain, start + voice.attack, voice.decay / 3);
    amp.gain.setTargetAtTime(0, end, voice.release / 3);
    filter.connect(amp).connect(this.#output);

    const center = (voice.waves.length - 1) / 2;
    voice.waves.forEach((type, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = hz(note);
      oscillator.detune.value = center === 0 ? 0 : ((index - center) / center) * voice.detune;
      if (voice.vibrato && duration > 0.4) this.#vibrato(oscillator, start + 0.2, end);
      oscillator.connect(filter);
      oscillator.start(start);
      oscillator.stop(end + voice.release * 2);
    });
  }

  chord(notes: readonly NoteName[], t: number, duration: number, voice: Voice, gain: number): void {
    for (const note of notes) this.note(note, t, duration, voice, gain);
  }

  /** ノイズ。シンバルやスネア、上がっていく効果音に使う */
  noise(t: number, duration: number, { filter, from, to = from, q = 1, gain, swell = false }: NoiseOptions): void {
    const context = this.#context;
    const start = this.#start + t;
    const end = start + duration;

    const source = context.createBufferSource();
    source.buffer = this.#noise;
    source.loop = true;
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, start);
    if (to !== from) biquad.frequency.exponentialRampToValueAtTime(to, end);

    const amp = context.createGain();
    if (swell) {
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, end);
      amp.gain.linearRampToValueAtTime(0, end + 0.03);
    } else {
      amp.gain.setValueAtTime(gain, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    source.connect(biquad).connect(amp).connect(this.#output);
    // 毎回同じノイズにならないよう、読み始める位置をずらす
    source.start(start, Math.random() * NOISE_SECONDS);
    source.stop(end + 0.05);
  }

  /** 音程が下がっていく低い打撃音（ティンパニやキックの代わり） */
  boom(t: number, { from, to, duration, gain }: { from: number; to: number; duration: number; gain: number }): void {
    const context = this.#context;
    const start = this.#start + t;
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration * 0.7);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(amp).connect(this.#output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  /** 音程が上がっていく音（ためるときの効果音） */
  sweep(t: number, duration: number, from: NoteName, to: NoteName, gain: number): void {
    const context = this.#context;
    const start = this.#start + t;
    const end = start + duration;
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(hz(from), start);
    oscillator.frequency.exponentialRampToValueAtTime(hz(to), end);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, start);
    filter.frequency.exponentialRampToValueAtTime(6000, end);
    const amp = context.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, end);
    amp.gain.linearRampToValueAtTime(0, end + 0.03);
    oscillator.connect(filter).connect(amp).connect(this.#output);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }

  #vibrato(oscillator: OscillatorNode, from: number, until: number): void {
    const context = this.#context;
    const lfo = context.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = context.createGain();
    depth.gain.setValueAtTime(0, from);
    depth.gain.linearRampToValueAtTime(14, from + 0.3);
    lfo.connect(depth).connect(oscillator.detune);
    lfo.start(from);
    lfo.stop(until + 0.5);
  }
}
