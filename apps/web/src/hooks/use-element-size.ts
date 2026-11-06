import { useCallback, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/** 要素の大きさを追いかける。グラフを親の大きさいっぱいに描くのに使う */
export function useElementSize<T extends HTMLElement>(): [ref: (element: T | null) => void, size: ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((element: T | null) => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
