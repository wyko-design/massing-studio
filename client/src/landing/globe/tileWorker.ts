/// <reference lib="webworker" />
import { runTileJob, type TileJob } from "./tileGeometry";

/** Runs the map tiles' polygon work off the main thread (see tileGeometry.ts). */
self.onmessage = (e: MessageEvent<{ id: number; job: TileJob }>) => {
  const { id, job } = e.data;
  try {
    self.postMessage({ id, result: runTileJob(job) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
