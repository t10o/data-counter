import type { StreamMessage } from "@data-counter/core";
import type { Ingestor } from "./ingest.ts";
import type { SessionService } from "./sessions.ts";
import { throttle } from "./throttle.ts";

/** 進行中の実戦の集計を配り直す間隔。メダルの払い出し中でも画面が追いつく程度にする */
const SESSION_INTERVAL_MS = 200;

/**
 * 画面に流すメッセージをまとめて配る。
 * 集計結果は接続ごとではなく 1 回だけ作り、間引いてから全員に送る。
 */
export class LiveFeed {
  readonly #sessions: SessionService;
  readonly #subscribers = new Set<(message: StreamMessage) => void>();
  readonly #unsubscribe: (() => void)[];

  constructor(sessions: SessionService, ingestor: Ingestor) {
    this.#sessions = sessions;

    const publishSession = throttle(() => {
      // 見ている画面がなければ集計結果を作らない
      if (this.#subscribers.size > 0) this.#publish({ type: "session", data: sessions.current() });
    }, SESSION_INTERVAL_MS);
    this.#unsubscribe = [
      sessions.subscribe(publishSession),
      ingestor.subscribe(({ events, device }) => {
        if (events.length > 0) this.#publish({ type: "edges", data: events });
        this.#publish({ type: "device", data: device });
      }),
      publishSession.cancel,
    ];
  }

  /** 接続した直後に送るメッセージ */
  initialMessages(): StreamMessage[] {
    return [{ type: "session", data: this.#sessions.current() }];
  }

  subscribe(subscriber: (message: StreamMessage) => void): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  close(): void {
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#subscribers.clear();
  }

  #publish(message: StreamMessage): void {
    for (const subscriber of this.#subscribers) subscriber(message);
  }
}
