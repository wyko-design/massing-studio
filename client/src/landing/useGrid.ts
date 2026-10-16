import { useEffect, useState } from "react";
import { CELL, computeGrid, type Grid } from "./grid";

const measure = (minRows: number, cell: number) =>
  computeGrid(document.documentElement.clientWidth, window.innerHeight, window.devicePixelRatio || 1, minRows, cell);

const same = (a: Grid, b: Grid) =>
  a.cell === b.cell && a.N === b.N && a.M === b.M && a.ox === b.ox && a.oy === b.oy && a.width === b.width && a.height === b.height && a.dpr === b.dpr;

/** Page grid for the current viewport; recomputed on resize and when devicePixelRatio changes (browser zoom, other screen). */
export function useGrid(minRows: number, cell = CELL): Grid {
  const [grid, setGrid] = useState(() => measure(minRows, cell));

  useEffect(() => {
    const update = () => setGrid((g) => {
      const next = measure(minRows, cell);
      return same(g, next) ? g : next;
    });
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    window.addEventListener("resize", update);

    // a resolution media query matches only the current dpr, so re-arm it after every change
    let mq: MediaQueryList | null = null;
    const onDpr = () => {
      update();
      arm();
    };
    const arm = () => {
      mq?.removeEventListener("change", onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener("change", onDpr);
    };
    arm();
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      mq?.removeEventListener("change", onDpr);
    };
  }, [minRows, cell]);

  return grid;
}
