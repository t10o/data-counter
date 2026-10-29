import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 開発中は /api を手元のサーバー（apps/server）に流す。
 * ラズパイのデータを見ながら画面を作るときは API_TARGET=http://<ラズパイ>:3012 pnpm dev
 */
const apiTarget = process.env.API_TARGET ?? "http://localhost:3012";

export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": apiTarget },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    // React のプラグインは TanStack Start のあとに置く
    react(),
  ],
});
