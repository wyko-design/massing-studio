/**
 * BGT roads and water around a plot (Netherlands, PDOK). Verified against the live service on 2026-10-16:
 *   BGT OGC   https://api.pdok.nl/lv/bgt/ogc/v1/collections/<c>/items?bbox&bbox-crs&crs&limit=1000 (RD in, RD out), plus
 *             filter=eind_registratie IS NULL AND relatieve_hoogteligging = 0 & filter-lang=cql2-text
 * BGT keeps superseded versions of every object (they carry `eind_registratie`), so without the filter a box returns each object
 * several times; `relatieve_hoogteligging` 0 keeps ground level (no bridges, tunnels).
 * Roads are the carriageways only (`functie` rijbaan… and woonerf); footpaths, cycle paths, parking and road furniture are left out.
 * The pieces of each kind are merged into one shape and simplified, so a road is one clean polygon instead of a mosaic of segments.
 */
import polygonClipping from "polygon-clipping";
import { rdToWgs84 } from "@massing/shared";
import type { JsonFetcher } from "../cache/diskCache";

const RD = "http://www.opengis.net/def/crs/EPSG/0/28992";
const BGT = "https://api.pdok.nl/lv/bgt/ogc/v1/collections";
const PAGE = 1000;
const MAX_PAGES = 3;
/** Boxes up to this half side are one request chain (as before, so cached answers still match); larger ones are split. */
const SINGLE_BOX_M = 400;
/** Tile size for larger boxes (m), at most TILES_MAX per side; each tile has its own MAX_PAGES. */
const TILE_M = 800;
const TILES_MAX = 6;

/** [outer ring, ...holes] of [lon, lat]. */
export type LonLatPolygon = [number, number][][];

/** What a BGT surface is, for drawing: roads (carriageways) and water. Paving, green areas and yards are left out on purpose. */
export type GroundKind = "road" | "water";

/** BGT collections that make up each kind. */
export const GROUND_COLLECTIONS: Record<GroundKind, string[]> = {
  road: ["wegdeel"],
  water: ["waterdeel", "ondersteunendwaterdeel"],
};

export type Ground = Record<GroundKind, LonLatPolygon[]>;

/** Extra CQL filter per collection: of the road parts only the carriageways. */
const EXTRA_FILTER: Record<string, string> = { wegdeel: " AND (functie LIKE 'rijbaan%' OR functie = 'woonerf')" };

/** Merged shapes are simplified to this (m) and lose holes and pieces under these areas (m²). */
export const MERGE = { toleranceM: 0.3, minHoleM2: 40, minAreaM2: 25 };

type Feature = { id?: string | number; properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } };
type Page = { features?: Feature[]; links?: { rel: string; href: string }[] };

/** 7 decimals of a degree ≈ 1 cm: plenty, and the payload stays small. */
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;
/** Distance (m) under which a vertex may be dropped: BGT lines are mm-precise and curves come as dense chains of points. */
export const SIMPLIFY_M = 0.05;

/** Douglas–Peucker on an open chain of RD points. */
function simplifyChain(pts: number[][], tol: number): number[][] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0]!;
  const [bx, by] = pts[pts.length - 1]!;
  const len = Math.hypot(bx! - ax!, by! - ay!);
  let worst = -1;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const d = len === 0 ? Math.hypot(px! - ax!, py! - ay!) : Math.abs((bx! - ax!) * (ay! - py!) - (ax! - px!) * (by! - ay!)) / len;
    if (d > worst) [worst, at] = [d, i];
  }
  if (worst <= tol) return [pts[0]!, pts[pts.length - 1]!];
  return [...simplifyChain(pts.slice(0, at + 1), tol).slice(0, -1), ...simplifyChain(pts.slice(at), tol)];
}

/** A closed ring (first = last) simplified to `tol`; split at its farthest point so the ring's own start is not special. Keeps at least a triangle. */
export function simplifyRing(ring: number[][], tol = SIMPLIFY_M): number[][] {
  if (ring.length <= 4) return ring;
  const open = ring.slice(0, -1);
  let far = 0;
  let best = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i]![0]! - open[0]![0]!, open[i]![1]! - open[0]![1]!);
    if (d > best) [best, far] = [d, i];
  }
  const a = simplifyChain(open.slice(0, far + 1), tol);
  const b = simplifyChain([...open.slice(far), open[0]!], tol);
  const out = [...a.slice(0, -1), ...b];
  // b ends on the ring's start, so `out` is closed again
  return out.length >= 4 ? out : ring;
}

const toLonLat = (ring: number[][], tol = SIMPLIFY_M): [number, number][] =>
  simplifyRing(ring, tol).map((c) => {
    const [lon, lat] = rdToWgs84(c[0]!, c[1]!);
    return [round7(lon), round7(lat)];
  });

/** Polygons of a GeoJSON Polygon / MultiPolygon feature, RD → lon/lat (anything else gives none). */
export function polygonsOf(f: Feature): LonLatPolygon[] {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [(g.coordinates as number[][][]).map(toLonLat)];
  if (g.type === "MultiPolygon") return (g.coordinates as number[][][][]).map((p) => p.map(toLonLat));
  return [];
}

/** Polygons of a GeoJSON Polygon / MultiPolygon feature in RD metres, rounded to 1 cm so that neighbouring pieces share vertices. */
export function rdPolygonsOf(f: Feature): number[][][][] {
  const g = f.geometry;
  const r = (ring: number[][]) => ring.map((c) => [Math.round(c[0]! * 100) / 100, Math.round(c[1]! * 100) / 100]);
  if (g?.type === "Polygon") return [(g.coordinates as number[][][]).map(r)];
  if (g?.type === "MultiPolygon") return (g.coordinates as number[][][][]).map((p) => p.map(r));
  return [];
}

const ringArea = (ring: number[][]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
  return Math.abs(a) / 2;
};

const union = (polys: number[][][][]) => {
  const [first, ...rest] = polys;
  return polygonClipping.union(first as never, ...(rest as never[])) as unknown as number[][][][];
};

/**
 * Union of many polygons that survives polygon-clipping's occasional failure on large inputs ("Infinite loop…", "Unable to
 * complete output ring"): on a failure the polygons are split in two along the longer axis of their positions, each half is
 * merged the same way, and the halves are joined if that works (else kept side by side). Only the trouble spot stays split.
 */
export function robustUnion(polys: number[][][][]): number[][][][] {
  if (polys.length <= 1) return polys;
  try {
    return union(polys);
  } catch {
    if (polys.length <= 4) return polys;
    const at = polys.map((p) => p[0]![0]!);
    const xs = at.map((q) => q[0]!);
    const ys = at.map((q) => q[1]!);
    const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1;
    const order = polys.map((_, i) => i).sort((i, j) => at[i]![axis]! - at[j]![axis]!);
    const half = order.length >> 1;
    const left = robustUnion(order.slice(0, half).map((i) => polys[i]!));
    const right = robustUnion(order.slice(half).map((i) => polys[i]!));
    try {
      return union([...left, ...right]);
    } catch {
      return [...left, ...right];
    }
  }
}

/**
 * Unions the polygons (RD metres) into single shapes, simplifies the rings and drops slivers: holes under `minHoleM2`
 * (the odd gap between segments, a tree pit) and pieces under `minAreaM2`. See `robustUnion` for when the union fails.
 */
export function mergePolygons(polys: number[][][][], m = MERGE): number[][][][] {
  if (!polys.length) return [];
  const merged = robustUnion(polys);
  return merged.flatMap((p) => {
    const [outer, ...holes] = p;
    if (!outer || ringArea(outer) < m.minAreaM2) return [];
    const keep = holes.filter((h) => ringArea(h) >= m.minHoleM2);
    return [[outer, ...keep].map((ring) => simplifyRing(ring, m.toleranceM))];
  });
}

const box = (x: number, y: number, r: number) => [x - r, y - r, x + r, y + r].join(",");

/** Follows `next` links (at most MAX_PAGES pages). */
async function allFeatures(fetchJson: JsonFetcher, provider: string, first: string): Promise<Feature[]> {
  const out: Feature[] = [];
  let url: string | null = first;
  for (let i = 0; url && i < MAX_PAGES; i++) {
    const page = (await fetchJson(provider, url)) as Page;
    out.push(...(page.features ?? []));
    url = page.links?.find((l) => l.rel === "next")?.href ?? null;
  }
  return out;
}

export function bgtUrl(collection: string, x: number, y: number, radiusM: number): string {
  const q = new URLSearchParams({
    f: "json",
    bbox: box(x, y, radiusM),
    "bbox-crs": RD,
    crs: RD,
    limit: String(PAGE),
    filter: "eind_registratie IS NULL AND relatieve_hoogteligging = 0" + (EXTRA_FILTER[collection] ?? ""),
    "filter-lang": "cql2-text",
  });
  return `${BGT}/${collection}/items?${q}`;
}

/**
 * Tile centres and half side covering the box of half side `radiusM` around (x, y): the box itself when small. The service
 * pages in its own order, so one big box under a page cap would lose whole areas; per tile the loss (if any) stays local.
 */
export function bgtTiles(x: number, y: number, radiusM: number): { x: number; y: number; r: number }[] {
  if (radiusM <= SINGLE_BOX_M) return [{ x, y, r: radiusM }];
  const n = Math.min(TILES_MAX, Math.ceil((2 * radiusM) / TILE_M));
  const half = radiusM / n;
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ x: x - radiusM + (2 * i + 1) * half, y: y - radiusM + (2 * j + 1) * half, r: half });
  return out;
}

/**
 * Every feature of a collection in the box, tile by tile (in parallel). A surface crossing a tile edge comes back from each
 * tile it touches: kept once (by its id), as identical copies would break the union that merges the pieces.
 */
async function boxFeatures(fetchJson: JsonFetcher, collection: string, x: number, y: number, radiusM: number): Promise<Feature[]> {
  const parts = await Promise.all(bgtTiles(x, y, radiusM).map((t) => allFeatures(fetchJson, "bgt", bgtUrl(collection, t.x, t.y, t.r))));
  if (parts.length === 1) return parts[0]!;
  const seen = new Map<string, Feature>();
  for (const f of parts.flat()) seen.set(String(f.id ?? f.properties?.lokaal_id ?? JSON.stringify(f.geometry)), f);
  return [...seen.values()];
}

/** Merged carriageway polygons in RD metres (outer ring first), for geometry work such as finding the street side of a plot. */
export async function roadPolygonsRd(fetchJson: JsonFetcher, x: number, y: number, radiusM: number): Promise<number[][][][]> {
  const rd: number[][][][] = [];
  for (const f of await boxFeatures(fetchJson, "wegdeel", x, y, radiusM)) rd.push(...rdPolygonsOf(f));
  return mergePolygons(rd);
}

/** Current ground-level BGT surfaces in the box, grouped by kind. */
export async function groundSurfaces(fetchJson: JsonFetcher, x: number, y: number, radiusM: number): Promise<Ground> {
  const kinds = Object.keys(GROUND_COLLECTIONS) as GroundKind[];
  const out: Ground = { road: [], water: [] };
  await Promise.all(
    kinds.map(async (kind) => {
      const rd: number[][][][] = [];
      await Promise.all(
        GROUND_COLLECTIONS[kind].map(async (c) => {
          for (const f of await boxFeatures(fetchJson, c, x, y, radiusM)) rd.push(...rdPolygonsOf(f));
        }),
      );
      // already simplified by the merge: no second pass when converting to lon/lat
      out[kind] = mergePolygons(rd).map((p) => p.map((ring) => toLonLat(ring, 0)));
    }),
  );
  return out;
}
