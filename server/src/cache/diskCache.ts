import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheMode } from "../config";

/** Fetches JSON for a provider request, through the disk cache. */
export type JsonFetcher = (provider: string, url: string) => Promise<unknown>;

export class CacheMissError extends Error {
  constructor(public readonly url: string) {
    super(`Not in cache and CACHE_MODE=offline: ${url}`);
    this.name = "CacheMissError";
  }
}

export class UpstreamError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`Upstream request failed (${status}): ${url}`);
    this.name = "UpstreamError";
  }
}

export function cacheFileName(provider: string, url: string): string {
  return `${provider}-${createHash("sha1").update(url).digest("hex").slice(0, 12)}.json`;
}

export type JsonFetcherOptions = {
  /** Absolute cache root (data/cache). */
  cacheRoot: string;
  /** Sub-directory under the root: the site id, or "_adhoc". */
  dir: string;
  mode: CacheMode;
  fetchImpl?: typeof fetch;
  /** Extra request headers per provider name. */
  headers?: Record<string, Record<string, string>>;
};

/** Like `createJsonFetcher`, for text pages (stored as `<provider>-<sha1>.txt`). */
export function createTextFetcher({ cacheRoot, dir, mode, fetchImpl = fetch, headers = {} }: JsonFetcherOptions): (provider: string, url: string) => Promise<string> {
  return async (provider, url) => {
    const file = path.join(cacheRoot, dir, cacheFileName(provider, url).replace(/\.json$/, ".txt"));
    try {
      return await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (mode === "offline") throw new CacheMissError(url);
    const res = await fetchImpl(url, { headers: { accept: "text/html", ...headers[provider] } });
    if (!res.ok) throw new UpstreamError(url, res.status);
    const text = await res.text();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    return text;
  };
}

/** Raw HTTP JSON bodies are stored per URL, so offline mode replays exactly what the provider sent. */
export function createJsonFetcher({ cacheRoot, dir, mode, fetchImpl = fetch, headers = {} }: JsonFetcherOptions): JsonFetcher {
  return async (provider, url) => {
    const file = path.join(cacheRoot, dir, cacheFileName(provider, url));
    try {
      return JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (mode === "offline") throw new CacheMissError(url);

    const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers[provider] } });
    if (!res.ok) throw new UpstreamError(url, res.status);
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      // some services answer 200 with an HTML page when a request is not accepted: never cache that
      throw new UpstreamError(url, 415);
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    return body;
  };
}
