import { z } from "zod";

/** CN2 のピン番号（1〜8。6 番はリレーコモンなので信号には使えない） */
export const pinSchema = z
  .int()
  .min(1)
  .max(8)
  .refine((pin) => pin !== 6, "6 番ピンはリレーコモンです");

/** 画面で種別を塗り分けるときの色名 */
export const kindColors = ["red", "blue", "aqua", "orange", "yellow", "magenta", "violet", "green", "gray"] as const;

const kindSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id は英小文字・数字・ハイフンのみ"),
  label: z.string().min(1),
  color: z.enum(kindColors).default("gray"),
  maxOut: z
    .int()
    .nonnegative()
    .optional()
    .describe("信号が ON の間の払い出しがこの枚数以下ならこの種別とみなす。種別が複数ある信号で、最後以外の種別に必須"),
});

const signalSchema = z
  .object({
    pin: pinSchema,
    label: z.string().min(1).optional().describe("種別が決まるまでの表示名。省略時は種別名を / でつなぐ"),
    kinds: z.array(kindSchema).min(1),
    resetsGames: z
      .boolean()
      .default(true)
      .describe(
        "当たったらボナ間のゲーム数（ハマり）を 0 に戻し、合成確率に数えるか。ART のセットなどは false にする（ボナ・ART 間のゲーム数はどちらでも 0 に戻す）",
      ),
  })
  .superRefine((signal, ctx) => {
    signal.kinds.slice(0, -1).forEach((kind, index) => {
      if (kind.maxOut === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["kinds", index, "maxOut"],
          message: "最後以外の種別には maxOut が必要です",
        });
      }
    });
  });

export const machineSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id は英小文字・数字・ハイフンのみ"),
    name: z.string().min(1),
    maker: z.string().optional(),
    note: z.string().optional(),
    debounceMs: z
      .number()
      .nonnegative()
      .lt(50, "50 ms 以上にすると、IN や OUT のパルスまで捨ててしまいます")
      .default(10)
      .describe(
        "チャタリングとみなして無視する時間（ミリ秒）。これより短いパルスは捨てる。IN / OUT のパルスを消さないよう 50 未満にする（目安は 10）",
      ),
    gameGapMs: z
      .number()
      .positive()
      .default(1000)
      .describe(
        "IN のパルスがこれだけあいたら次のゲームとみなす（ミリ秒）。レバーオンで出るパルスの塊を 1 ゲームと数えるので、ベット枚数が変わっても数えられる",
      ),
    pins: z
      .object({
        in: pinSchema.default(1),
        out: pinSchema.default(2),
      })
      .prefault({}),
    signals: z.array(signalSchema),
  })
  .superRefine((machine, ctx) => {
    const pins = [machine.pins.in, machine.pins.out, ...machine.signals.map((signal) => signal.pin)];
    if (new Set(pins).size !== pins.length) {
      ctx.addIssue({ code: "custom", path: ["signals"], message: "同じピンが複数回使われています" });
    }
    const kindIds = machine.signals.flatMap((signal) => signal.kinds.map((kind) => kind.id));
    if (new Set(kindIds).size !== kindIds.length) {
      ctx.addIssue({ code: "custom", path: ["signals"], message: "種別の id が重複しています" });
    }
  });

const levelSchema = z.union([z.literal(0), z.literal(1)]);

/**
 * Pico から届くイベントの束。
 * events の各要素は [seq, CN2 のピン番号, レベル（0 = Low = 接点が閉じた）, 起動からのマイクロ秒]。
 */
export const ingestRequestSchema = z.object({
  device: z.string().min(1).max(64),
  boot: z.string().regex(/^[0-9a-f]{8,32}$/),
  now: z.int().nonnegative().describe("送信した時点の、起動からのマイクロ秒。サーバーはこれで時刻を合わせる"),
  events: z.array(z.tuple([z.int().positive(), pinSchema, levelSchema, z.int().nonnegative()])).max(1000),
  remaining: z
    .int()
    .nonnegative()
    .default(0)
    .describe("送りきれずに Pico に残っているイベントの数。0 なら now より前のイベントはすべて送ってある"),
  status: z
    .object({
      rssi: z.number(),
      memFree: z.int().nonnegative(),
      dropped: z.int().nonnegative(),
      levels: z.array(z.tuple([pinSchema, levelSchema])),
    })
    .partial()
    .default({}),
});

export const startSessionRequestSchema = z.object({
  machineId: z.string().min(1),
});

export const updateSessionRequestSchema = z.object({
  machineId: z.string().min(1),
});
