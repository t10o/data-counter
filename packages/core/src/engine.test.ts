import { describe, expect, it } from "vitest";
import { CounterEngine } from "./engine.ts";
import { testMachine, Timeline } from "./test-utils.ts";

const IN = 1;
const OUT = 2;
const REG = 3;
const BIG = 4;

describe("CounterEngine", () => {
  it("counts medals and games", () => {
    const timeline = new Timeline().games(10).game(15).games(2);
    const summary = new CounterEngine(testMachine()).pushAll(timeline.events).finish().summary();

    expect(summary).toMatchObject({
      in: 39,
      out: 15,
      diff: -24,
      totalGames: 13,
      currentGames: 13,
      maxGames: 13,
      minDiff: -33,
    });
    expect(summary.payoutRate).toBeCloseTo(15 / 39);
  });

  it("counts a burst of IN pulses as one game, whatever the bet", () => {
    const timeline = new Timeline()
      .pulses(IN, 3)
      .wait(4000)
      .pulses(IN, 2)
      .wait(4000)
      .pulses(IN, 1)
      .wait(4000)
      .pulses(IN, 3);
    const summary = new CounterEngine(testMachine()).pushAll(timeline.events).finish().summary();

    expect(summary).toMatchObject({ in: 9, totalGames: 4 });
  });

  it("starts a new game only after gameGapMs without IN pulses", () => {
    // 塊の最後のパルスから次の塊の最初のパルスまで 600 ms
    const timeline = new Timeline().pulses(IN, 3).wait(500).pulses(IN, 3);
    const count = (gameGapMs: number) =>
      new CounterEngine(testMachine({ gameGapMs })).pushAll(timeline.events).finish().summary().totalGames;

    expect(count(1000)).toBe(1);
    expect(count(600)).toBe(2);
  });

  it("ignores chattering shorter than debounceMs", () => {
    const timeline = new Timeline()
      .fall(IN)
      .wait(2)
      .rise(IN)
      .wait(2)
      .fall(IN)
      .wait(40)
      .rise(IN)
      .wait(1)
      .fall(IN)
      .wait(1)
      .rise(IN);
    const summary = new CounterEngine(testMachine({ debounceMs: 30 })).pushAll(timeline.events).finish().summary();

    expect(summary.in).toBe(1);
  });

  it("records hits with the games since the previous one", () => {
    const timeline = new Timeline()
      .games(120)
      .fall(BIG)
      .games(30, 8)
      .rise(BIG)
      .games(45)
      .fall(REG)
      .games(10, 10)
      .rise(REG)
      .games(5);
    const snapshot = new CounterEngine(testMachine()).pushAll(timeline.events).finish().snapshot();

    expect(snapshot.hits).toMatchObject([
      { index: 1, kindId: "big", games: 120, totalGames: 120, out: 240, gamesDuring: 30 },
      { index: 2, kindId: "reg", games: 45, totalGames: 195, out: 100, gamesDuring: 10 },
    ]);
    expect(snapshot.totalGames).toBe(210);
    expect(snapshot.currentGames).toBe(5);
    expect(snapshot.maxGames).toBe(120);
    expect(snapshot.hitCount).toBe(2);
    expect(snapshot.hitProbability).toBe(105);
    expect(snapshot.kinds).toEqual([
      { id: "big", label: "BIG", color: "red", count: 1, probability: 210 },
      { id: "reg", label: "REG", color: "blue", count: 1, probability: 210 },
    ]);
  });

  it("counts short pulse signals as hits", () => {
    const timeline = new Timeline().games(50).pulses(BIG, 1).games(20).pulses(REG, 1).games(3);
    const summary = new CounterEngine(testMachine()).pushAll(timeline.events).finish().summary();

    expect(summary.kinds.map((kind) => kind.count)).toEqual([1, 1]);
    expect(summary.currentGames).toBe(3);
  });

  it("splits a shared signal by the payout while it was on", () => {
    const machine = testMachine({
      signals: [
        {
          pin: BIG,
          label: "BONUS",
          kinds: [
            { id: "reg", label: "REG", maxOut: 150 },
            { id: "big", label: "BIG" },
          ],
        },
      ],
    });
    const engine = new CounterEngine(machine);
    const timeline = new Timeline().games(10).fall(BIG).games(20, 11);
    engine.pushAll(timeline.events);

    expect(engine.snapshot().hits[0]).toMatchObject({ kindId: null, label: "BONUS", endedAtUs: null });

    const pushed = timeline.events.length;
    timeline.rise(BIG).games(10).fall(BIG).games(10, 9).rise(BIG);
    engine.pushAll(timeline.events.slice(pushed)).finish();

    expect(engine.snapshot().hits.map((hit) => [hit.kindId, hit.out])).toEqual([
      ["big", 220],
      ["reg", 90],
    ]);
  });

  it("does not reset the current games for signals with resetsGames: false", () => {
    const machine = testMachine({
      signals: [{ pin: REG, resetsGames: false, kinds: [{ id: "art", label: "ART" }] }],
    });
    const timeline = new Timeline().games(30).pulses(REG, 1).games(20);
    const summary = new CounterEngine(machine).pushAll(timeline.events).finish().summary();

    expect(summary.currentGames).toBe(50);
    expect(summary.hitCount).toBe(0);
    expect(summary.kinds[0]?.count).toBe(1);
  });

  it("counts games since any hit (bonus or ART) apart from games since a bonus", () => {
    const machine = testMachine({
      signals: [
        { pin: BIG, kinds: [{ id: "big", label: "BIG" }] },
        { pin: REG, resetsGames: false, kinds: [{ id: "art", label: "ART" }] },
      ],
    });
    const timeline = new Timeline()
      .games(30)
      .pulses(REG, 1)
      .games(20)
      .fall(BIG)
      .games(25, 8)
      .rise(BIG)
      .games(12)
      .pulses(REG, 1)
      .games(7);
    const snapshot = new CounterEngine(machine).pushAll(timeline.events).finish().snapshot();

    expect(snapshot.hits.map((hit) => [hit.kindId, hit.games, hit.gamesAny])).toEqual([
      ["art", 30, 30],
      ["big", 50, 20],
      ["art", 12, 12],
    ]);
    expect(snapshot).toMatchObject({ currentGames: 19, maxGames: 50, currentGamesAny: 7, maxGamesAny: 30 });
  });

  it("keeps games since a bonus running while a non-resetting signal stays on", () => {
    const machine = testMachine({
      signals: [{ pin: REG, resetsGames: false, kinds: [{ id: "art", label: "ART" }] }],
    });
    const timeline = new Timeline().games(10).fall(REG).games(40).rise(REG).games(5);
    const summary = new CounterEngine(machine).pushAll(timeline.events).finish().summary();

    expect(summary).toMatchObject({ currentGames: 55, currentGamesAny: 5, maxGamesAny: 10 });
  });

  it("gives the same games since any hit when every signal resets the games", () => {
    const timeline = new Timeline().games(40).fall(BIG).games(20, 8).rise(BIG).games(15);
    const summary = new CounterEngine(testMachine()).pushAll(timeline.events).finish().summary();

    expect(summary).toMatchObject({ currentGames: 15, currentGamesAny: 15, maxGames: 40, maxGamesAny: 40 });
  });

  it("ignores a signal that was already on before counting started", () => {
    const timeline = new Timeline().games(5).rise(BIG).games(5);
    const summary = new CounterEngine(testMachine()).pushAll(timeline.events).finish().summary();

    expect(summary.hitCount).toBe(0);
    expect(summary.currentGames).toBe(10);
  });

  it("waits for debounceMs before committing, unless time is advanced", () => {
    const engine = new CounterEngine(testMachine({ debounceMs: 30 }));
    const timeline = new Timeline().fall(OUT);
    engine.pushAll(timeline.events);

    expect(engine.summary().out).toBe(0);

    engine.advanceTo(timeline.wait(30).nowUs);
    expect(engine.summary().out).toBe(1);
  });

  it("plots the difference at the end of each game, ending at the current one", () => {
    const timeline = new Timeline().games(2).game(10).pulses(IN, 3);
    const snapshot = new CounterEngine(testMachine()).pushAll(timeline.events).finish().snapshot();

    expect(snapshot.slump).toEqual([
      [0, 0],
      [1, -3],
      [2, -6],
      [3, 1],
      [4, -2],
    ]);
  });

  it("reports active signals", () => {
    const timeline = new Timeline().games(3).fall(BIG).game(15);
    const engine = new CounterEngine(testMachine({ debounceMs: 30 })).pushAll(timeline.events);
    engine.advanceTo(timeline.nowUs);

    expect(engine.summary().activePins).toEqual([BIG]);
  });
});
