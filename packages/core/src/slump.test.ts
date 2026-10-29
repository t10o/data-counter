import { describe, expect, it } from "vitest";
import { toSlumpPoints } from "./slump.ts";

describe("toSlumpPoints", () => {
  it("keeps every point when there are few enough", () => {
    expect(toSlumpPoints([0, -3, 5], 10)).toEqual([
      [0, 0],
      [1, -3],
      [2, 5],
    ]);
  });

  it("thins out points but keeps the peaks, the bottoms and both ends", () => {
    const diffByGame = Array.from({ length: 10_001 }, (_, games) => Math.round(Math.sin(games / 500) * 1000));
    diffByGame[4321] = 5000;
    diffByGame[7777] = -5000;

    const points = toSlumpPoints(diffByGame, 200);

    expect(points.length).toBeLessThanOrEqual(200);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([10_000, diffByGame[10_000]]);
    expect(points).toContainEqual([4321, 5000]);
    expect(points).toContainEqual([7777, -5000]);

    const games = points.map(([g]) => g);
    expect(games).toEqual(games.toSorted((a, b) => a - b));
  });
});
