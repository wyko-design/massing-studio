import type { Geometry } from "geojson";

/**
 * OpenStreetMap clients for the city step: administrative boundary (Nominatim) and map details
 * (Overpass). Endpoints and parameters checked against the live services on 2026-10-16:
 * - Nominatim `search`: q, countrycodes, featuretype=settlement, format=jsonv2, polygon_geojson=1,
 *   polygon_threshold (degrees of simplification), limit; needs an identifying User-Agent; max 1 request/s.
 * - Overpass `interpreter`: POST `data=<query>`; `convert item ::=::,::geom=geom(),h=t["highway"]` copies the tags, adds the
 *   highway class as `h` and the geometry as a GeoJSON LineString (`geometry`); `out geom qt` prints it (only `h` is kept here).
 *   The public instances are often at capacity (HTTP 502/504): several are tried in turn.
 */

const USER_AGENT = "MassingStudio-prototype/0.1 (TU Delft Generative AI Design course)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = ["https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"];

export type Bbox = { s: number; w: number; n: number; e: number };

export type CityBoundary = {
  /** Centre used for the camera (GeoNames coordinates), lon/lat. */
  centre: [number, number];
  bbox: Bbox;
  /** Administrative boundary, or null when OSM has none (the client then draws a circle). */
  polygon: Geometry | null;
  source: "osm" | "none";
};

type NominatimHit = {
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string]; // south, north, west, east
  geojson?: Geometry;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Degrees between a point and a hit (rough, for picking the hit nearest the expected place). */
const near = (lat: number, lon: number, hit: NominatimHit) =>
  Math.hypot(lat - Number(hit.lat), (lon - Number(hit.lon)) * Math.cos((lat * Math.PI) / 180));

export async function fetchBoundary(
  name: string,
  cc: string,
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<CityBoundary> {
  const params = new URLSearchParams({
    q: name,
    countrycodes: cc.toLowerCase(),
    featuretype: "settlement",
    format: "jsonv2",
    polygon_geojson: "1",
    polygon_threshold: "0",
    limit: "5",
  });
  const res = await fetchImpl(`${NOMINATIM}?${params}`, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const hits = (await res.json()) as NominatimHit[];
  const areas = hits
    .filter((h) => h.geojson && (h.geojson.type === "Polygon" || h.geojson.type === "MultiPolygon") && near(lat, lon, h) < 0.6)
    .sort((a, b) => near(lat, lon, a) - near(lat, lon, b));
  const hit = areas[0];
  if (!hit) {
    // no polygon: a box of about 6 km around the centre
    const d = 0.03;
    return { centre: [lon, lat], bbox: { s: lat - d, n: lat + d, w: lon - d * 1.5, e: lon + d * 1.5 }, polygon: null, source: "none" };
  }
  const [s, n, w, e] = hit.boundingbox.map(Number) as [number, number, number, number];
  return { centre: [lon, lat], bbox: { s, w, n, e }, polygon: hit.geojson!, source: "osm" };
}

export type MapDetails = {
  /** Roads as polylines [lon, lat][], class 0 = motorway/trunk, 1 = primary, 2 = secondary, 3 = tertiary. */
  roads: { c: number; p: [number, number][] }[];
  /** Rivers and lakes (outlines / centre lines). */
  water: [number, number][][];
};

/** `out geom` gives [{lat, lon}]; a `convert` with ::geom gives a GeoJSON LineString. */
type OverpassElement = {
  geometry?: { lat: number; lon: number }[] | { type: string; coordinates: number[][] };
  tags?: Record<string, string>;
};

const CLASS: Record<string, number> = { motorway: 0, trunk: 0, primary: 1, secondary: 2, tertiary: 3 };

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** The element's points as [lon, lat][] (rounded to ~1 m), or null when it has fewer than two. */
function lineOf(el: OverpassElement): [number, number][] | null {
  const g = el.geometry;
  if (!g) return null;
  const pts = Array.isArray(g)
    ? g.map((q) => [round(q.lon), round(q.lat)] as [number, number])
    : g.type === "LineString"
      ? g.coordinates.map((q) => [round(q[0]!), round(q[1]!)] as [number, number])
      : [];
  return pts.length > 1 ? pts : null;
}

export function parseWater(json: unknown): [number, number][][] {
  const els = (json as { elements?: OverpassElement[] }).elements ?? [];
  return els.flatMap((el) => {
    const p = lineOf(el);
    return p ? [p] : [];
  });
}

export function parseRoads(json: unknown): MapDetails["roads"] {
  const els = (json as { elements?: OverpassElement[] }).elements ?? [];
  return els.flatMap((el) => {
    const p = lineOf(el);
    return p ? [{ c: CLASS[el.tags?.h ?? ""] ?? 3, p }] : [];
  });
}

async function overpass(query: string, fetchImpl: typeof fetch): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length]!;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`Overpass ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass failed");
}

/** Biggest area queried: 0.35° ≈ 39 km. Larger boxes are clipped around their centre. */
export const MAX_SPAN_DEG = 0.35;

export function clampBbox(b: Bbox, span = MAX_SPAN_DEG): Bbox {
  const cy = (b.s + b.n) / 2;
  const cx = (b.w + b.e) / 2;
  const h = Math.min(b.n - b.s, span) / 2;
  const w = Math.min(b.e - b.w, span) / 2;
  return { s: cy - h, n: cy + h, w: cx - w, e: cx + w };
}

export async function fetchDetails(bbox: Bbox, fetchImpl: typeof fetch = fetch): Promise<MapDetails> {
  const b = clampBbox(bbox);
  const box = `${b.s.toFixed(4)},${b.w.toFixed(4)},${b.n.toFixed(4)},${b.e.toFixed(4)}`;
  // tertiary roads only for small areas, otherwise the answer gets very large
  const small = Math.max(b.n - b.s, b.e - b.w) <= 0.12;
  const classes = small ? "motorway|trunk|primary|secondary|tertiary" : "motorway|trunk|primary|secondary";
  const roads = parseRoads(
    await overpass(
      `[out:json][timeout:60];(way["highway"~"^(${classes})$"](${box}););convert item ::=::,::geom=geom(),h=t["highway"];out geom qt;`,
      fetchImpl,
    ),
  );
  let water: [number, number][][] = [];
  try {
    water = parseWater(
      await overpass(
        `[out:json][timeout:60];(way["waterway"~"^(river|canal)$"](${box});way["natural"="water"](${box}););convert item ::=::,::geom=geom();out geom qt;`,
        fetchImpl,
      ),
    );
  } catch {
    // water is optional; the roads are enough to read the place
  }
  return { roads, water };
}
