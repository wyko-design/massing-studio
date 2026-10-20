import type { MultiPolygon, Position } from "geojson";
import { perfCall, timed } from "../perf";
import { cityTiles, countryTiles, type CityTiles, type CountryTiles, type TileJob } from "./tileGeometry";

/**
 * The tiles' polygon work in a worker, so the globe keeps moving while it runs. Without workers (tests, an old browser) or
 * when the worker fails, it runs on the main thread as before.
 */
let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === "undefined" ? null : new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error !== undefined) w.reject(new Error(e.data.error));
      else w.resolve(e.data.result);
    };
    worker.onerror = () => {
      // the worker could not load or crashed: every open job and every later one runs on the main thread
      worker = null;
      for (const w of waiting.values()) w.reject(new Error("tile worker failed"));
      waiting.clear();
    };
  }
  return worker;
}

function inWorker<R>(job: TileJob, inline: () => R): Promise<R> {
  const w = getWorker();
  if (!w) return Promise.resolve(timed(`${job.kind}Tiles (main)`, inline));
  const id = ++nextId;
  const t0 = performance.now();
  return new Promise<R>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (r: unknown) => void, reject });
    w.postMessage({ id, job });
  }).then(
    (r) => {
      perfCall(`${job.kind}Tiles (worker, wall time)`, performance.now() - t0);
      return r;
    },
    () => timed(`${job.kind}Tiles (main, after worker error)`, inline),
  );
}

export function countryTilesAsync(geometry: MultiPolygon, water: Position[][][], pxDeg: number): Promise<CountryTiles> {
  return inWorker({ kind: "country", geometry, water, pxDeg }, () => countryTiles(geometry, water, pxDeg));
}

export function cityTilesAsync(geometry: MultiPolygon, water: Position[][][], pxDeg: number): Promise<CityTiles> {
  return inWorker({ kind: "city", geometry, water, pxDeg }, () => cityTiles(geometry, water, pxDeg));
}
