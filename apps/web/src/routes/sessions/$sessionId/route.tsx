import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "../../../lib/api";
import { machinesQuery, sessionQuery } from "../../../lib/queries";

/** /sessions/$sessionId 以下で共通の、実戦と機種の読み込み */
export const Route = createFileRoute("/sessions/$sessionId")({
  params: {
    parse: ({ sessionId }) => ({ sessionId: Number(sessionId) }),
    stringify: ({ sessionId }) => ({ sessionId: String(sessionId) }),
  },
  loader: async ({ context: { queryClient }, params: { sessionId } }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(sessionQuery(sessionId)),
        queryClient.ensureQueryData(machinesQuery()),
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  notFoundComponent: () => <p className="py-16 text-center text-zinc-400">この実戦は見つかりませんでした</p>,
});
