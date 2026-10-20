/// <reference lib="webworker" />
import { runModelJob, transferOf, type ModelJob } from "./modelWork";

/** Runs the site model's heavy work off the main thread (see modelWork.ts). */
self.onmessage = (e: MessageEvent<{ id: number; job: ModelJob }>) => {
  const { id, job } = e.data;
  try {
    const result = runModelJob(job);
    self.postMessage({ id, result }, transferOf(result));
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
