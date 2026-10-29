import { useCallback, useState } from "react";

/** 要素の幅を追いかける。グラフを親の幅いっぱいに描くのに使う */
export function useElementWidth<T extends HTMLElement>(): [ref: (element: T | null) => void, width: number] {
  const [width, setWidth] = useState(0);

  const ref = useCallback((element: T | null) => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
