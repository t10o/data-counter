import type { KindColor, MachineConfig } from "@data-counter/core";

/** 外部集中端子板 Ⅶ型 CN2 のピンの呼び名 */
const CN2_PIN_NAMES: Readonly<Record<number, string>> = {
  1: "メダル投入",
  2: "メダル払出",
  3: "外部出力1",
  4: "外部出力2",
  5: "外部出力3",
  7: "外部出力4",
  8: "外部出力5",
};

export const cn2PinName = (pin: number): string => CN2_PIN_NAMES[pin] ?? `${pin}番`;

/** 機種設定でそのピンが何を表すか。わからなければ CN2 の呼び名 */
export function pinLabel(pin: number, machine: MachineConfig | undefined): string {
  if (machine?.pins.in === pin) return "IN";
  if (machine?.pins.out === pin) return "OUT";
  const signal = machine?.signals.find((s) => s.pin === pin);
  if (signal) return signal.label ?? signal.kinds.map((kind) => kind.label).join("/");
  return cn2PinName(pin);
}

/**
 * 種別の色。暗い背景の上で区別できるか検証した 8 色（BIG 赤・REG 青の組み合わせは色覚特性があっても見分けられる）。
 * 3 色以上を並べるときは、色だけに頼らず形やラベルでも区別すること。
 */
export const KIND_COLORS: Readonly<Record<KindColor, string>> = {
  red: "#e66767",
  blue: "#3987e5",
  aqua: "#199e70",
  orange: "#d95926",
  yellow: "#c98500",
  magenta: "#d55181",
  violet: "#9085e9",
  green: "#008300",
  gray: "#898781",
};

export type MarkerShape = "circle" | "square" | "diamond" | "triangle";
const SHAPES: readonly MarkerShape[] = ["circle", "square", "diamond", "triangle"];

/** グラフの当たりの印の形。機種設定での種別の並び順で決める */
export function kindShape(machine: MachineConfig | undefined, kindId: string | null): MarkerShape {
  const kinds = machine?.signals.flatMap((signal) => signal.kinds) ?? [];
  const index = kinds.findIndex((kind) => kind.id === kindId);
  return index < 0 ? "circle" : (SHAPES[index % SHAPES.length] ?? "circle");
}
