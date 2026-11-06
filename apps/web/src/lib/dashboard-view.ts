import { stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";

/** 実戦の画面の切り替え。それぞれ 1 画面に収まるようにしてある */
export const DASHBOARD_VIEWS = {
  data: "データ",
  graph: "グラフ",
  hits: "当たり履歴",
} as const;

export type DashboardView = keyof typeof DASHBOARD_VIEWS;

/**
 * 実戦の画面の検索パラメーター。どの画面を見ているかを URL に持たせて、再読み込みしても同じ画面にする。
 * リンクでは省略できるよう default を、変な値が来ても落ちないよう catch を付ける
 */
export const dashboardSearchSchema = z.object({
  view: z.enum(["data", "graph", "hits"]).default("data").catch("data"),
});

/** 既定の画面（データ）のときは、URL に ?view=data を付けない */
export const dashboardSearchMiddlewares = [stripSearchParams<z.output<typeof dashboardSearchSchema>>({ view: "data" })];
