const integer = new Intl.NumberFormat("ja-JP");
const timeOfDay = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTime = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatInteger = (value: number): string => integer.format(value);

/** 差枚など。プラスにも符号を付ける */
export const formatSigned = (value: number): string =>
  value > 0 ? `+${integer.format(value)}` : integer.format(value);

/** 確率の分母を「1/123.4」の形にする */
export const formatProbability = (denominator: number | null): string =>
  denominator === null ? "—" : `1/${denominator.toFixed(1)}`;

/** 目安でしかない確率を「約1/123.4」の形にする */
export const formatApproxProbability = (denominator: number | null): string =>
  denominator === null ? "—" : `約${formatProbability(denominator)}`;

export const formatPercent = (ratio: number | null): string => (ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`);

export const formatTime = (atUs: number): string => timeOfDay.format(atUs / 1000);

/** ミリ秒まで出す時刻（生イベントの一覧用） */
export const formatTimeMs = (atUs: number): string =>
  `${formatTime(atUs)}.${String(Math.floor((atUs % 1_000_000) / 1000)).padStart(3, "0")}`;

export const formatDateTime = (atUs: number): string => dateTime.format(atUs / 1000);

export function formatDuration(us: number): string {
  const totalSeconds = Math.max(0, Math.floor(us / 1_000_000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}時間${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

/** パルス幅など、短い時間をミリ秒で */
export const formatMs = (us: number): string => `${(us / 1000).toFixed(1)} ms`;

/** 基準の時刻からのずれを秒で（答え合わせ用） */
export const formatOffset = (us: number): string => `${us >= 0 ? "+" : "−"}${(Math.abs(us) / 1_000_000).toFixed(3)} s`;
