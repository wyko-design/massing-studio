import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheMissError, UpstreamError, cacheFileName, createJsonFetcher } from "./diskCache";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "massing-cache-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("disk cache", () => {
  it("fetches on miss, stores, and serves the hit without the network", async () => {
    let calls = 0;
    const fetchImpl = (async () => (calls++, jsonResponse({ a: 1 }))) as unknown as typeof fetch;
    const fetchJson = createJsonFetcher({ cacheRoot: root, dir: "site", mode: "readwrite", fetchImpl });
    expect(await fetchJson("p", "https://x/y")).toEqual({ a: 1 });
    expect(await fetchJson("p", "https://x/y")).toEqual({ a: 1 });
    expect(calls).toBe(1);
    expect(await readdir(path.join(root, "site"))).toEqual([cacheFileName("p", "https://x/y")]);
  });
  it("offline mode serves cached responses and throws on a miss", async () => {
    const online = createJsonFetcher({
      cacheRoot: root,
      dir: "site",
      mode: "readwrite",
      fetchImpl: (async () => jsonResponse({ ok: true })) as unknown as typeof fetch,
    });
    await online("p", "https://x/cached");
    const offline = createJsonFetcher({ cacheRoot: root, dir: "site", mode: "offline" });
    expect(await offline("p", "https://x/cached")).toEqual({ ok: true });
    await expect(offline("p", "https://x/missing")).rejects.toBeInstanceOf(CacheMissError);
  });
  it("does not cache failed responses", async () => {
    const fetchJson = createJsonFetcher({
      cacheRoot: root,
      dir: "site",
      mode: "readwrite",
      fetchImpl: (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
    });
    await expect(fetchJson("p", "https://x/bad")).rejects.toBeInstanceOf(UpstreamError);
    await expect(readdir(path.join(root, "site"))).rejects.toThrow();
  });
  it("keys are stable and differ per url and provider", () => {
    expect(cacheFileName("a", "u")).toBe(cacheFileName("a", "u"));
    expect(cacheFileName("a", "u")).not.toBe(cacheFileName("a", "v"));
    expect(cacheFileName("a", "u")).not.toBe(cacheFileName("b", "u"));
  });
});
