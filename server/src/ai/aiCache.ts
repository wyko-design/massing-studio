import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheMode } from "../config";
import type { AiResult } from "./callStructured";

export type AiCacheOptions = { cacheRoot: string; dir: string; mode: CacheMode };

/**
 * Last good answer per request, so the demo can replay AI results offline (SPEC §15). In
 * readwrite mode the model is always called and the answer stored; offline mode only replays.
 */
export function createAiCache({ cacheRoot, dir, mode }: AiCacheOptions) {
  const fileOf = (call: string, key: unknown) =>
    path.join(cacheRoot, dir, `ai-${call}-${createHash("sha1").update(JSON.stringify(key)).digest("hex").slice(0, 12)}.json`);

  return async function cached<T>(call: string, key: unknown, run: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
    const file = fileOf(call, key);
    if (mode === "offline") {
      try {
        const hit = JSON.parse(await readFile(file, "utf8")) as AiResult<T> & { ok: true };
        return { ...hit, meta: { ...hit.meta, costUsd: null, cached: true } };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        return {
          ok: false,
          error: { kind: "unavailable", message: "Offline (CACHE_MODE=offline) and no cached answer for this request.", details: [] },
        };
      }
    }
    const result = await run();
    if (result.ok) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2));
    }
    return result;
  };
}
export type AiCache = ReturnType<typeof createAiCache>;
