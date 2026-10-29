import { useEffect, useState } from "react";

/** intervalMs ごとに更新される現在時刻（UNIX エポックからのマイクロ秒） */
export function useNowUs(intervalMs = 1000): number {
  const [nowUs, setNowUs] = useState(() => Date.now() * 1000);

  useEffect(() => {
    const timer = setInterval(() => setNowUs(Date.now() * 1000), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return nowUs;
}
