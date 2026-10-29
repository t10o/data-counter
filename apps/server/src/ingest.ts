import type { DeviceStatus, IngestRequest, IngestResponse, StoredEdgeEvent } from "@data-counter/core";
import type { SessionService } from "./sessions.ts";
import { type NewEdgeEvent, type Store, toDeviceStatus } from "./store.ts";

export interface Ingested {
  events: StoredEdgeEvent[];
  device: DeviceStatus;
}

/** Pico から届いたイベントを保存して、集計と配信に回す */
export class Ingestor {
  readonly #store: Store;
  readonly #sessions: SessionService;
  readonly #nowUs: () => number;
  readonly #listeners = new Set<(ingested: Ingested) => void>();

  constructor(store: Store, sessions: SessionService, { nowUs = () => Date.now() * 1000 } = {}) {
    this.#store = store;
    this.#sessions = sessions;
    this.#nowUs = nowUs;
  }

  subscribe(listener: (ingested: Ingested) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  ingest(request: IngestRequest): IngestResponse {
    const receivedAtUs = this.#nowUs();

    const { boot, events, ack } = this.#store.transaction(() => {
      const saved = this.#store.saveBoot({
        id: request.boot,
        deviceId: request.device,
        nowUs: request.now,
        seenAtUs: receivedAtUs,
        report: request.status,
      });
      const inserted = this.#store.insertEvents(
        request.events.map(([seq, pin, level, tUs]): NewEdgeEvent => ({
          bootId: saved.id,
          seq,
          pin,
          edge: level === 0 ? "fall" : "rise",
          tUs,
          atUs: tUs + saved.offsetUs,
        })),
        receivedAtUs,
      );
      const first = inserted[0];
      const last = inserted.at(-1);
      if (first && last) this.#store.invalidateSnapshots({ fromUs: first.atUs, toUs: last.atUs });
      return { boot: saved, events: inserted, ack: this.#store.maxSeq(saved.id) };
    });

    if (boot.firstSeenAtUs === receivedAtUs) {
      console.info(`device ${boot.deviceId} booted (boot ${boot.id})`);
    }

    // 送り残しがあると、それより前のイベントがまだ届くかもしれない。確かめられたところまで時間を進める
    const lastEvent = request.events.at(-1);
    const completeUntilUs = request.remaining > 0 && lastEvent ? lastEvent[3] : request.now;
    this.#sessions.record(events, completeUntilUs + boot.offsetUs);
    const ingested = { events, device: toDeviceStatus(boot) };
    for (const listener of this.#listeners) listener(ingested);

    return { ack };
  }
}
