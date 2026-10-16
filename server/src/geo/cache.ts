import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheMode } from "../config";
import { CacheMissError } from "../cache/diskCache";

/**
 * Disk cache for computed JSON (data/cache/_geo/<name>-<hash>.json): the answer is stored per key,
 * so a city that was looked up once works offline afterwards.
 */
export async function cachedJson<T>(
  cacheRoot: string,
  mode: CacheMode,
  name: string,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const file = path.join(cacheRoot, "_geo", `${name}-${createHash("sha1").update(key).digest("hex").slice(0, 12)}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (mode === "offline") throw new CacheMissError(key);
  const value = await compute();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
  return value;
}
