import { fetchStreets } from "../geoApi";
import { perfCall, timed } from "../perf";
import { toLonLat, type PlotData } from "../globe/plotLayer";
import type { ModelData } from "./modelData";
import type { Graph } from "./movers";
import { blockedOf, runModelJob, type ModelJob, type PreparedModel, type StreetLonLat } from "./modelWork";

/**
 * The site model's heavy work in a worker, so the rules window stays responsive while the model is prepared behind it.
 * Without workers (tests, an old browser) or when the worker fails, it runs on the main thread as before.
 * The same inputs share one job (StrictMode renders and remounts ask twice).
 */
let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === "undefined" ? null : new Worker(new URL("./modelWorker.ts", import.meta.url), { type: "module" });
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
      for (const w of waiting.values()) w.reject(new Error("model worker failed"));
      waiting.clear();
    };
  }
  return worker;
}

function inWorker<R>(name: string, job: ModelJob): Promise<R> {
  const inline = () => runModelJob(job) as R;
  const w = getWorker();
  if (!w) return Promise.resolve(timed(name, inline));
  const id = ++nextId;
  const t0 = performance.now();
  return new Promise<R>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (r: unknown) => void, reject });
    w.postMessage({ id, job });
  }).then(
    (r) => {
      perfCall(`${name} (worker, wall time)`, performance.now() - t0);
      return r;
    },
    () => timed(`${name} (main, after worker error)`, inline),
  );
}

const models = new WeakMap<PlotData, Map<string, Promise<PreparedModel>>>();

/** `buildModel` and its buildings' geometry off the main thread. */
export function prepareModelAsync(plot: PlotData, half: number, dotLevel: number, rippleM: number): Promise<PreparedModel> {
  const key = `${half}|${dotLevel}|${rippleM}`;
  let byKey = models.get(plot);
  if (!byKey) models.set(plot, (byKey = new Map()));
  let p = byKey.get(key);
  if (!p) byKey.set(key, (p = inWorker<PreparedModel>("prepareModel", { kind: "model", plot, half, dotLevel, rippleM })));
  return p;
}

/** `walkGraph` of a model's square off the main thread, from the streets as fetched (lon/lat). */
export function walkGraphAsync(model: ModelData, streets: StreetLonLat[]): Promise<Graph> {
  return inWorker<Graph>("walkGraph", { kind: "walk", streets, local: model.local, half: model.half, blocked: blockedOf(model) });
}

const graphs = new WeakMap<ModelData, Promise<Graph>>();

/** The walking graph of a model: its square's streets fetched, then walked off the main thread. A failure is not kept. */
export function modelGraph(model: ModelData): Promise<Graph> {
  let p = graphs.get(model);
  if (!p) {
    const [w, s] = toLonLat(model.local, -model.half, -model.half);
    const [e, n] = toLonLat(model.local, model.half, model.half);
    p = fetchStreets({ s, w, n, e }).then((streets) => walkGraphAsync(model, streets));
    graphs.set(model, p);
    p.catch(() => graphs.delete(model));
  }
  return p;
}
