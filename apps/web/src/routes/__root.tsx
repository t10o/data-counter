import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppHeader } from "../components/app-header";
import { useLiveStream } from "../lib/live-stream";
import appCss from "../styles.css?url";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#09090b" },
      // ホーム画面に追加したとき、ブラウザの枠なしの全画面で開く（iOS の古い版向け。新しい版は manifest の display を見る）
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "apple-mobile-web-app-title", content: "データカウンター" },
      { title: "データカウンター" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      // ホーム画面のアイコンからは、追加したときのページではなく必ずトップ（今の実戦）を開く（start_url）
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  const { queryClient } = Route.useRouteContext();
  useLiveStream(queryClient);

  return (
    // 画面の高さに固定して、スクロールは本体（main）の中でする。実戦の画面はこの高さいっぱいに広げて 1 画面に収める
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main id="main" data-scroll-restoration-id="main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
