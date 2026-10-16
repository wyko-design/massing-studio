import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeTile, fetchTileData, resetTileJson, tileRange, tileZoom, type TileData } from "./tiles";

// a real OpenFreeMap tile on the coast of Casablanca (zoom 14, extent 4096, buffer 64)
const FIXTURE = path.join(__dirname, "fixtures", "tile-14-7844-6566.pbf");
const Z = 14;
const X = 7844;
const Y = 6566;

const lonOf = (x: number) => (x / 2 ** Z) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** Z))) * 180) / Math.PI;

describe("tileZoom / tileRange", () => {
  it("picks the finest zoom for a small box and a coarser one for a big box", () => {
    expect(tileZoom({ s: 33.6, n: 33.61, w: -7.65, e: -7.64 })).toBe(14);
    expect(tileZoom({ s: 33.4, n: 33.73, w: -7.93, e: -7.28 })).toBe(12);
    expect(tileZoom({ s: 0, n: 10, w: 0, e: 10 })).toBe(8);
    expect(tileZoom({ s: -56, n: -17, w: -81, e: -66 })).toBe(6); // Chile
    expect(tileZoom({ s: 0, n: 80, w: -180, e: 180 })).toBe(3);
  });

  it("covers the box with tiles", () => {
    const r = tileRange({ s: latOf(Y + 1) + 1e-4, n: latOf(Y) - 1e-4, w: lonOf(X) + 1e-4, e: lonOf(X + 1) - 1e-4 }, Z);
    expect(r).toEqual({ x0: X, x1: X, y0: Y, y1: Y });
  });
});

describe("decodeTile", () => {
  it("turns the water layer into lon/lat polygons, and land borders up to level 8", async () => {
    const out: TileData = { z: Z, water: [], borders: [] };
    decodeTile(new Uint8Array(await readFile(FIXTURE)), Z, X, Y, out);
    expect(out.water.length).toBeGreaterThan(0);
    // everything lies in or just around the tile (the buffer is 64/4096 of its size)
    const pad = (lonOf(X + 1) - lonOf(X)) * 0.03;
    for (const poly of out.water) {
      for (const [lon, lat] of poly[0]!) {
        expect(lon).toBeGreaterThan(lonOf(X) - pad);
        expect(lon).toBeLessThan(lonOf(X + 1) + pad);
        expect(lat).toBeLessThan(latOf(Y) + pad);
        expect(lat).toBeGreaterThan(latOf(Y + 1) - pad);
      }
    }
    expect(out.borders.every((b) => b.l <= 8)).toBe(true);
  });
});

describe("fetchTileData", () => {
  it("reads the TileJSON, fetches every tile of the box and merges them", async () => {
    resetTileJson();
    const fixture = await readFile(FIXTURE);
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/planet")) return new Response(JSON.stringify({ tiles: ["https://t.example/v1/{z}/{x}/{y}.pbf"] }));
      return new Response(fixture);
    }) as unknown as typeof fetch;
    const data = await fetchTileData({ s: latOf(Y + 1) + 1e-4, n: latOf(Y) - 1e-4, w: lonOf(X) + 1e-4, e: lonOf(X + 1) - 1e-4 }, fetchImpl);
    expect(calls).toEqual(["https://tiles.openfreemap.org/planet", `https://t.example/v1/${Z}/${X}/${Y}.pbf`]);
    expect(data.z).toBe(Z);
    expect(data.water.length).toBeGreaterThan(0);
  });

  it("retries a failing tile and gives up with an error", async () => {
    resetTileJson();
    let n = 0;
    const fetchImpl = (async (url: string) => {
      if (url.endsWith("/planet")) return new Response(JSON.stringify({ tiles: ["https://t.example/{z}/{x}/{y}.pbf"] }));
      n++;
      return new Response("", { status: 503 });
    }) as unknown as typeof fetch;
    await expect(fetchTileData({ s: latOf(Y + 1) + 1e-4, n: latOf(Y) - 1e-4, w: lonOf(X) + 1e-4, e: lonOf(X + 1) - 1e-4 }, fetchImpl)).rejects.toThrow("503");
    expect(n).toBe(3);
  }, 10_000);
});
