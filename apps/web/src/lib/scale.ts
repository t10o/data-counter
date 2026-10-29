/** 1・2・5 × 10^n のきりのいい刻み */
function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const fraction = rawStep / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return Math.max(1, nice * base);
}

/** min〜max を覆う、だいたい count 個のきりのいい目盛り。両端は min と max の外側に広げる */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max > min ? max - min : 1;
  const step = niceStep(span / Math.max(1, count));
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  return Array.from({ length: last - first + 1 }, (_, i) => (first + i) * step);
}

/** 昇順に並んだ values のうち、target にいちばん近いものの添字 */
export function nearestIndex(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((values[mid] ?? 0) < target) low = mid + 1;
    else high = mid;
  }
  const previous = low - 1;
  if (previous >= 0 && Math.abs((values[previous] ?? 0) - target) <= Math.abs((values[low] ?? 0) - target)) {
    return previous;
  }
  return low;
}
