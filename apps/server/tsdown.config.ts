import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  dts: false,
  // ラズパイで依存パッケージを入れなくて済むよう、全部 1 ファイルにまとめる
  deps: { alwaysBundle: [/.*/], onlyBundle: false },
});
