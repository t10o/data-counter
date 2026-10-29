export interface Throttled {
  (): void;
  cancel(): void;
}

/**
 * 呼ばれてもすぐには実行せず、intervalMs に 1 回だけ実行する。
 * 最後の呼び出しは必ず実行されるので、最新の状態を取りこぼさない。
 */
export function throttle(fn: () => void, intervalMs: number): Throttled {
  let timer: NodeJS.Timeout | undefined;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  const run = () => {
    timer = undefined;
    lastRunAt = Date.now();
    fn();
  };

  const throttled = () => {
    if (timer !== undefined) return;
    const wait = lastRunAt + intervalMs - Date.now();
    if (wait <= 0) {
      run();
    } else {
      timer = setTimeout(run, wait);
    }
  };
  throttled.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return throttled;
}
