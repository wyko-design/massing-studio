import { PbfReader } from "pbf";
import { VectorTile } from "@mapbox/vector-tile";
import type { Bbox } from "./osm";

/**
 * Water polygons and administrative borders for the city view, from OpenFreeMap's vector tiles
 * (OpenMapTiles schema over OpenStreetMap; https://openfreemap.org, free, no key, CDN with a year-long max-age).
 * Verified against the live service on 2026-10-16:
 * - TileJSON `https://tiles.openfreemap.org/planet`: `tiles[0]` is a versioned `{z}/{x}/{y}.pbf` template (the version
 *   changes with every planet update, so the TileJSON is read again after an hour), minzoom 0, maxzoom 14.
 * - Layer `water`: polygons, `class` ocean | lake | river | dock …; the ocean is a real polygon at every zoom, so the
 *   shore is exact (no land/sea guessing from line fragments). Layer `boundary`: lines with `admin_level`
 *   (2, 4, 6, 8, 9, 10 …), `maritime` 1 where the line runs at sea, `disputed`.
 * - extent 4096, a buffer of 64 around each tile; y grows downwards.
 * Usage policy: a unique User-Agent, at most 4 requests in parallel.
 */

const USER_AGENT = "MassingStudio-prototype/0.1 (TU Delft Generative AI Design course)";
const TILEJSON = "https://tiles.openfreemap.org/planet";
const PARALLEL = 4;
const MAX_TILES = 120;
/**
 * Water that would show up small in the city view is left out (ponds and ditches would drown the map in outlines);
 * the ocean always stays. The box is twice the final frame (~400 px), so a pixel is span / 800 degrees. A piece
 * (a tile only holds the part of a water body inside it) is kept when it is at least 30 px long, 3 px wide on average and 200 px².
 * Islands in kept water (holes) have to pass the same test.
 */
export function pixelMetres(b: Bbox): number {
  return (Math.max(b.e - b.w, b.n - b.s) / 800) * 111_320;
}

/** Borders of levels up to this one (2 country … 8 municipality) are kept; 9 and 10 are districts. */
const MAX_ADMIN_LEVEL = 8;

export type TileData = {
  /** Tile zoom used. */
  z: number;
  /** Water polygons as [outer ring, ...holes] of [lon, lat]. */
  water: [number, number][][][];
  /** Administrative borders (land only), by level. */
  borders: { l: number; p: [number, number][] }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tileJson: { url: string; at: number } | null = null;

async function tileTemplate(fetchImpl: typeof fetch): Promise<string> {
  if (tileJson && Date.now() - tileJson.at < 3_600_000) return tileJson.url;
  const res = await fetchImpl(TILEJSON, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenFreeMap TileJSON ${res.status}`);
  const url = ((await res.json()) as { tiles?: string[] }).tiles?.[0];
  if (!url) throw new Error("OpenFreeMap TileJSON without tiles");
  tileJson = { url, at: Date.now() };
  return url;
}

/** Forgets the remembered TileJSON (tests). */
export const resetTileJson = () => void (tileJson = null);

async function fetchTile(template: string, z: number, x: number, y: number, fetchImpl: typeof fetch): Promise<Uint8Array | null> {
  const url = template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { "user-agent": USER_AGENT } });
      if (res.status === 404) return null; // no data in this tile
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      last = new Error(`OpenFreeMap tile ${res.status}`);
    } catch (e) {
      last = e;
    }
    await sleep(300 * 2 ** attempt);
  }
  throw last instanceof Error ? last : new Error("OpenFreeMap tile failed");
}

const lonToX = (lon: number, n: number) => ((lon + 180) / 360) * n;
const latToY = (lat: number, n: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
};
/** Coordinates are rounded to what the zoom can show: ~100 m for a country, ~10 m for a region, ~1 m for a city. */
const roundTo = (z: number) => {
  const f = z <= 6 ? 1e3 : z <= 9 ? 1e4 : 1e5;
  return (v: number) => Math.round(v * f) / f;
};

/** Tile zoom for a box: about eight tiles across its longer side, between zoom 3 (a country) and the tiles' maximum 14 (a district). */
export function tileZoom(b: Bbox): number {
  const span = Math.max(b.e - b.w, b.n - b.s, 1e-4);
  return Math.max(3, Math.min(14, Math.round(Math.log2(2880 / span))));
}

/** Tile column/row ranges covering the box. */
export function tileRange(b: Bbox, z: number) {
  const n = 2 ** z;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));
  return { x0: clamp(lonToX(b.w, n)), x1: clamp(lonToX(b.e, n)), y0: clamp(latToY(b.n, n)), y1: clamp(latToY(b.s, n)) };
}

type Pt = { x: number; y: number };

/** The ring's signed area in tile coordinates (y down); MVT exterior rings are positive. */
function area(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]!.x - ring[i]!.x) * (ring[j]!.y + ring[i]!.y);
  return a / 2;
}

/** True unless a ring is substantial: at least 30 px long, 3 px wide on average and 200 px² (`pixelM` metres per pixel; 0 keeps everything). */
function tooSmall(ring: [number, number][], pixelM: number): boolean {
  if (pixelM <= 0) return false;
  let w = Infinity;
  let e = -Infinity;
  let sMin = Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    sMin = Math.min(sMin, y);
    n = Math.max(n, y);
  }
  const m = 111_320;
  const long = Math.max((e - w) * Math.cos((((sMin + n) / 2) * Math.PI) / 180), n - sMin) * m;
  const area = ringAreaM2(ring);
  return long < 30 * pixelM || area / long < 3 * pixelM || area < 200 * pixelM * pixelM;
}

/** Area of a lon/lat ring in square metres (planar approximation at the ring's latitude). */
function ringAreaM2(ring: [number, number][]): number {
  let a = 0;
  let lat = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j]![0] - ring[i]![0]) * (ring[j]![1] + ring[i]![1]);
    lat += ring[i]![1];
  }
  const m = 111_320;
  return Math.abs(a / 2) * m * m * Math.cos(((lat / ring.length) * Math.PI) / 180);
}

/** Drops consecutive equal points (rounding makes many at coarse zoom). */
function dedupe(pts: [number, number][]): [number, number][] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
}

/** A segment lying wholly in a tile's buffer is the clip edge or belongs to the neighbouring tile: not drawn. */
const inBuffer = (a: Pt, b: Pt, extent: number) =>
  (a.x < 0 && b.x < 0) || (a.x > extent && b.x > extent) || (a.y < 0 && b.y < 0) || (a.y > extent && b.y > extent);

/** Chains of consecutive points whose segments are not in the buffer. */
function visibleChains(pts: Pt[], closed: boolean, extent: number): Pt[][] {
  const chains: Pt[][] = [];
  let cur: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if (inBuffer(a, b, extent)) {
      if (cur.length > 1) chains.push(cur);
      cur = [];
    } else {
      if (!cur.length) cur.push(a);
      cur.push(b);
    }
  }
  if (cur.length > 1) chains.push(cur);
  return chains;
}

/** Decodes one tile into `out` (lon/lat). */
export function decodeTile(buf: Uint8Array, z: number, x: number, y: number, out: TileData, pixelM = 0, maxLevel = MAX_ADMIN_LEVEL) {
  const tile = new VectorTile(new PbfReader(buf));
  const n = 2 ** z;
  const round = roundTo(z);
  const toLL =
    (extent: number) =>
    (p: Pt): [number, number] => {
      const tx = x + p.x / extent;
      const ty = y + p.y / extent;
      return [round((tx / n) * 360 - 180), round((Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI)];
    };

  const water = tile.layers["water"];
  if (water) {
    const ll = toLL(water.extent);
    for (let i = 0; i < water.length; i++) {
      const f = water.feature(i);
      if (f.type !== 3) continue;
      const ocean = f.properties["class"] === "ocean";
      // group the rings into polygons (exterior ring, then its holes)
      const polys: Pt[][][] = [];
      for (const ring of f.loadGeometry() as Pt[][]) {
        if (ring.length < 3) continue;
        if (area(ring) > 0 || !polys.length) polys.push([ring]);
        else polys[polys.length - 1]!.push(ring);
      }
      for (const poly of polys) {
        const all = poly.map((r) => dedupe(r.map(ll)));
        if (!ocean && tooSmall(all[0]!, pixelM)) continue;
        const keep = all.map((r, i) => i === 0 || ocean || !tooSmall(r, pixelM));
        const rings = all.filter((_, i) => keep[i]);
        out.water.push(rings);
      }
    }
  }

  const boundary = tile.layers["boundary"];
  if (boundary) {
    const ll = toLL(boundary.extent);
    for (let i = 0; i < boundary.length; i++) {
      const f = boundary.feature(i);
      const level = Number(f.properties["admin_level"]);
      if (f.type !== 2 || f.properties["maritime"] === 1 || !(level <= maxLevel)) continue;
      for (const line of f.loadGeometry() as Pt[][]) {
        for (const chain of visibleChains(line, false, boundary.extent)) out.borders.push({ l: level, p: dedupe(chain.map(ll)) });
      }
    }
  }
}

/** Water and borders for a box: its tiles fetched (4 at a time) and decoded. */
export async function fetchTileData(bbox: Bbox, fetchImpl: typeof fetch = fetch, maxLevel = MAX_ADMIN_LEVEL): Promise<TileData> {
  // a coarser zoom when the box would need too many tiles (a boundary that runs far out to sea)
  let z = tileZoom(bbox);
  let r = tileRange(bbox, z);
  while (z > 4 && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_TILES) r = tileRange(bbox, --z);
  const jobs: [number, number][] = [];
  for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) jobs.push([tx, ty]);
  const template = await tileTemplate(fetchImpl);
  const out: TileData = { z, water: [], borders: [] };
  const pixelM = pixelMetres(bbox);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [tx, ty] = jobs[next++]!;
      const buf = await fetchTile(template, z, tx, ty, fetchImpl);
      if (buf) decodeTile(buf, z, tx, ty, out, pixelM, maxLevel);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
  return out;
}
