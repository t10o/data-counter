import type { z } from "zod";
import type {
  ingestRequestSchema,
  kindColors,
  machineSchema,
  startSessionRequestSchema,
  updateSessionRequestSchema,
} from "./schemas.ts";

export type MachineConfig = z.output<typeof machineSchema>;
export type MachineSignal = MachineConfig["signals"][number];
export type MachineKind = MachineSignal["kinds"][number];
/** 画面のボタンで手で数えるもの（リーチ目など） */
export type MachineCounter = MachineConfig["counters"][number];
export type KindColor = (typeof kindColors)[number];

/** ピンのレベル。プルアップしているので、接点が閉じると 0（Low）になる */
export type Level = 0 | 1;
export type Edge = "fall" | "rise";

/** 集計エンジンに入れる端子の変化 1 回分 */
export interface EdgeEvent {
  pin: number;
  edge: Edge;
  /** 発生時刻（UNIX エポックからのマイクロ秒） */
  atUs: number;
}

/** データベースに保存された生イベント */
export interface StoredEdgeEvent extends EdgeEvent {
  id: number;
  bootId: string;
  seq: number;
  /** Pico の起動からのマイクロ秒 */
  tUs: number;
}

/** 当たり 1 回分 */
export interface Hit {
  /** 1 始まりの通し番号 */
  index: number;
  pin: number;
  /** 種別。種別が複数ある信号では、信号が OFF になって払い出し枚数が決まるまで null */
  kindId: string | null;
  label: string;
  color: KindColor;
  startedAtUs: number;
  endedAtUs: number | null;
  /** ゲーム数を戻す信号（resetsGames。ボーナスなど）の前の当たりからのゲーム数（ボナ間ハマり） */
  games: number;
  /** resetsGames: false の信号（ART など）も含めた、前の当たりからのゲーム数（ボナ・ART 間ハマり） */
  gamesAny: number;
  /** 当たった時点の総ゲーム数 */
  totalGames: number;
  /** 当たった時点の差枚 */
  diff: number;
  /** 信号が ON の間の払い出し枚数 */
  out: number;
  /** 信号が ON の間のゲーム数 */
  gamesDuring: number;
}

export interface KindStat {
  id: string;
  label: string;
  color: KindColor;
  count: number;
  /** 確率の分母（1/x の x）。ボーナス中を除いたゲーム数（nonBonusGames）から出す。まだ当たっていなければ null */
  probability: number | null;
}

/** スランプグラフの点 [総ゲーム数, 差枚] */
export type SlumpPoint = readonly [games: number, diff: number];

export interface CounterSummary {
  machineId: string;
  totalGames: number;
  /**
   * ボーナス中（resetsGames の信号が ON の間）を除いたゲーム数。確率（手動集計も含む）の分母にする。
   * マイスロやホールのデータカウンターも、ボーナス中のゲーム数を確率の分母に入れない
   */
  nonBonusGames: number;
  /** ゲーム数を戻す信号（resetsGames。ボーナスなど）の最後の当たりからのゲーム数（ボナ間ハマり） */
  currentGames: number;
  /**
   * resetsGames: false の信号（ART など）も含めた、最後の当たりからのゲーム数（ボナ・ART 間ハマり）。
   * すべての信号がゲーム数を戻す機種では currentGames と同じになる
   */
  currentGamesAny: number;
  in: number;
  out: number;
  /** 差枚（OUT − IN） */
  diff: number;
  /** 機械割（OUT ÷ IN）。IN が 0 なら null */
  payoutRate: number | null;
  maxDiff: number;
  minDiff: number;
  /** currentGames の最大（ボナ間の最大ハマり） */
  maxGames: number;
  /** currentGamesAny の最大（ボナ・ART 間の最大ハマり） */
  maxGamesAny: number;
  kinds: KindStat[];
  /** ゲーム数を戻す信号の当たり回数の合計 */
  hitCount: number;
  /** 合成確率の分母 */
  hitProbability: number | null;
  /** resetsGames: false の信号（ART など）も含めた、すべての当たり回数の合計 */
  hitCountAny: number;
  /** hitCountAny の確率の分母 */
  hitProbabilityAny: number | null;
  /** いま ON になっている信号のピン番号 */
  activePins: number[];
  firstEventAtUs: number | null;
  lastEventAtUs: number | null;
}

export interface CounterSnapshot extends CounterSummary {
  hits: Hit[];
  slump: SlumpPoint[];
}

export type IngestRequest = z.output<typeof ingestRequestSchema>;
export type DeviceReport = IngestRequest["status"];

export interface IngestResponse {
  /** サーバーが保存済みの最大の seq。Pico はこれ以下のイベントを捨ててよい */
  ack: number;
}

export interface Session {
  id: number;
  machineId: string;
  startedAtUs: number;
  /** 進行中なら null */
  endedAtUs: number | null;
}

/** 手で数えた回数（キーは機種設定の counters の id）。数えていないものはキーがない */
export type ManualCounts = Record<string, number>;

export interface SessionDetail extends Session {
  snapshot: CounterSnapshot;
  manualCounts: ManualCounts;
}

export interface SessionListItem extends Session {
  summary: CounterSummary;
}

export interface DeviceStatus {
  deviceId: string;
  bootId: string;
  firstSeenAtUs: number;
  lastSeenAtUs: number;
  /** Pico の起動からの経過時間（最後に通信した時点） */
  uptimeUs: number;
  report: DeviceReport;
}

export type StartSessionRequest = z.input<typeof startSessionRequestSchema>;
export type UpdateSessionRequest = z.input<typeof updateSessionRequestSchema>;

/** /api/stream（Server-Sent Events）で流れるメッセージ */
export interface StreamMessages {
  session: SessionDetail | null;
  edges: StoredEdgeEvent[];
  device: DeviceStatus;
}

export type StreamMessage = {
  [K in keyof StreamMessages]: { type: K; data: StreamMessages[K] };
}[keyof StreamMessages];
