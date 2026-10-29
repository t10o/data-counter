import type { SlumpPoint } from "./types.ts";

/**
 * ゲーム数ごとの差枚（添字がゲーム数）を、点の数が maxPoints 以下のスランプグラフにする。
 *
 * 間引くときは区間ごとに最小と最大の点を残すので、山と谷の高さは変わらない。
 * 最初と最後の点は必ず残す。
 */
export function toSlumpPoints(diffByGame: readonly number[], maxPoints: number): SlumpPoint[] {
  const length = diffByGame.length;
  const at = (games: number): SlumpPoint => [games, diffByGame[games] ?? 0];

  if (length <= maxPoints) {
    return diffByGame.map((diff, games) => [games, diff]);
  }

  const innerStart = 1;
  const innerEnd = length - 1;
  const buckets = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const bucketSize = (innerEnd - innerStart) / buckets;
  const points: SlumpPoint[] = [at(0)];

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = innerStart + Math.floor(bucket * bucketSize);
    const end = Math.min(innerEnd, innerStart + Math.floor((bucket + 1) * bucketSize));
    if (start >= end) continue;

    let minGames = start;
    let maxGames = start;
    for (let games = start + 1; games < end; games++) {
      const diff = diffByGame[games] ?? 0;
      if (diff < (diffByGame[minGames] ?? 0)) minGames = games;
      if (diff > (diffByGame[maxGames] ?? 0)) maxGames = games;
    }

    if (minGames === maxGames) {
      points.push(at(minGames));
    } else {
      const [first, second] = minGames < maxGames ? [minGames, maxGames] : [maxGames, minGames];
      points.push(at(first), at(second));
    }
  }

  points.push(at(length - 1));
  return points;
}
