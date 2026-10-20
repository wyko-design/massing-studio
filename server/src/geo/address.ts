/**
 * Address suggestions and plots for the landing's address step (Netherlands, PDOK Locatieserver v3.1).
 * Endpoints and fields verified against the live service on 2026-10-16:
 *   reverse?lat&lon&type=gemeente  -> the municipality at a point (docs[].gemeentenaam)
 *   suggest?q&fq=type:adres&fq=gemeentenaam:"X"  -> prefix search over words, numbers and postcodes
 *   free?q&...                      -> same filters, tolerant of typos (the fallback when suggest finds nothing)
 *   lookup?id&fl=...                -> one address with centroide_ll / centroide_rd
 */
import { pointInRing, polygonArea, rdToWgs84, type Ring } from "@massing/shared";
import { createJsonFetcher, type JsonFetcher } from "../cache/diskCache";
import type { CacheMode } from "../config";
import { Bag3dContextProvider } from "../providers/nl/bag3d";
import { parseWktPoint } from "../providers/nl/locatieserver";
import { parcelUrl } from "../providers/nl/kadasterParcel";
import { groundSurfaces, type Ground, type LonLatPolygon } from "./plotContext";

export type { Ground, LonLatPolygon } from "./plotContext";

const BASE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const UA = { "user-agent": "massing-studio/0.1 (TU Delft course prototype)", accept: "application/json" };

export type AddressSuggestion = { id: string; label: string; lon: number; lat: number };

type Doc = { id?: string; weergavenaam?: string; gemeentenaam?: string; centroide_rd?: string; centroide_ll?: string };
const docsOf = (json: unknown): Doc[] => (json as { response?: { docs?: Doc[] } }).response?.docs ?? [];

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, { headers: UA });
  if (!res.ok) throw new Error(`PDOK ${res.status}: ${url}`);
  return res.json();
}

/** Municipality (gemeentenaam) at a point, e.g. The Hague → "'s-Gravenhage". Null when the point is not in the Netherlands. */
export async function municipalityAt(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), type: "gemeente", rows: "1", fl: "gemeentenaam" });
  return docsOf(await getJson(`${BASE}/reverse?${params}`, fetchImpl))[0]?.gemeentenaam ?? null;
}

/** Cleans what was typed: collapses blanks and drops characters the Solr query syntax would read as operators. */
export function normaliseQuery(q: string): string {
  return q
    .replace(/[+\-!(){}[\]^"~*?:\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const suggestUrl = (endpoint: "suggest" | "free", q: string, municipality: string | null, rows: number) => {
  const params = new URLSearchParams({ q, rows: String(rows), fl: "id,weergavenaam,centroide_ll" });
  params.append("fq", "type:adres");
  if (municipality) params.append("fq", `gemeentenaam:"${municipality.replace(/"/g, "")}"`);
  return `${BASE}/${endpoint}?${params}`;
};

/** Suggestions for what the user has typed so far, inside one municipality. suggest first, free (typo tolerant) when it finds nothing. */
export async function suggestAddresses(
  q: string,
  municipality: string | null,
  fetchImpl: typeof fetch = fetch,
  rows = 6,
): Promise<AddressSuggestion[]> {
  const query = normaliseQuery(q);
  if (query.length < 2) return [];
  const pick = (json: unknown) =>
    docsOf(json).flatMap((d) => {
      const ll = d.centroide_ll ? parseWktPoint(d.centroide_ll) : null;
      return d.id && d.weergavenaam && ll ? [{ id: d.id, label: d.weergavenaam, lon: ll.x, lat: ll.y }] : [];
    });
  const raw = await getJson(suggestUrl("suggest", query, municipality, rows), fetchImpl);
  const first = pick(raw);
  if (first.length) return first;
  // a typo: suggest's own spell check proposes corrected queries (with their hit counts); the best one is asked again
  const fixed = bestCollation(raw);
  if (fixed && fixed.toLowerCase() !== query.toLowerCase()) {
    const second = pick(await getJson(suggestUrl("suggest", fixed, municipality, rows), fetchImpl));
    if (second.length) return second;
  }
  return pick(await getJson(suggestUrl("free", query, municipality, rows), fetchImpl));
}

/** The corrected query with the most hits from a suggest answer (`spellcheck.collations` = ["collation", {collationQuery, hits}, …]). */
export function bestCollation(json: unknown): string | null {
  const list = (json as { spellcheck?: { collations?: unknown[] } }).spellcheck?.collations ?? [];
  let best: { q: string; hits: number } | null = null;
  for (const item of list) {
    const c = item as { collationQuery?: string; hits?: number };
    if (typeof c?.collationQuery === "string" && (!best || (c.hits ?? 0) > best.hits)) best = { q: c.collationQuery, hits: c.hits ?? 0 };
  }
  return best?.q ?? null;
}

export type Plot = {
  id: string;
  label: string;
  /** The address point, [lon, lat]. */
  point: [number, number];
  /** Cadastral parcel(s) under the address (all polygons of the feature), indicative boundary. */
  parcel: { id: string; areaM2: number | null; polygons: LonLatPolygon[] } | null;
  /** Width in metres of the frame (tighter axis) the plot is shown in. */
  frameM: number;
  /** Where the surroundings were fetched around, [lon, lat]: the parcel's centre (else the address point). */
  centre: [number, number];
  /** Half side (m) of the square box the surroundings cover, around `centre`. */
  radiusM: number;
  /** BAG buildings around it (the footprints 3DBAG builds its 3D model from), outer rings only, with the 3DBAG height (m). */
  buildings: { id: string; ring: [number, number][]; height: number }[];
  /** BGT ground surfaces around it: water (current, ground level). */
  ground: Ground;
};

/**
 * Frame width: the parcel with a margin on each side as wide as the parcel itself, but at most 150 m (a large parcel needs
 * its neighbours, not a district around it); at least 90 m. No upper limit, so every parcel fits.
 */
export const frameFor = (parcelMaxDimM: number | null) => {
  const d = parcelMaxDimM ?? 0;
  return Math.max(90, d + 2 * Math.min(d, 150));
};

/** Surroundings fetched for the 2D view: the frame's half-diagonal in a window up to ~1.5 : 1, plus a little. */
export const plotRadius = (frameM: number) => Math.round(frameM * 0.95);

/**
 * Footprints smaller than this (m²) are left out of a large frame: under ~2 px across they are noise, and a district-sized
 * frame would otherwise send tens of thousands of sheds.
 */
export const minFootprintM2 = (frameM: number) => (frameM <= 600 ? 0 : (frameM / 300) ** 2);

type PerceelFeature = {
  properties?: { sectie?: string; perceelnummer?: number; akr_kadastrale_gemeente_code_waarde?: string; kadastrale_grootte_waarde?: number };
  geometry?: { type: string; coordinates: number[][][][] };
};

const toLonLat = (ring: number[][]): [number, number][] => ring.map((c) => rdToWgs84(c[0]!, c[1]!));

/** The parcel feature that contains the point, with every polygon of it (a parcel can be several pieces). RD in, lon/lat out. */
export function parseParcelFeature(
  json: unknown,
  point: { x: number; y: number },
): { parcel: NonNullable<Plot["parcel"]>; maxDimM: number; centreRd: { x: number; y: number } } | null {
  for (const f of (json as { features?: PerceelFeature[] }).features ?? []) {
    if (f.geometry?.type !== "MultiPolygon") continue;
    const hit = f.geometry.coordinates.some((poly) => {
      const ring: Ring = poly[0]!.map((c) => [c[0]!, c[1]!]);
      return ring.length >= 3 && pointInRing([point.x, point.y], ring);
    });
    if (!hit) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const poly of f.geometry.coordinates) for (const [x, y] of poly[0]!) (xs.push(x!), ys.push(y!));
    const p = f.properties ?? {};
    return {
      parcel: {
        id: [p.akr_kadastrale_gemeente_code_waarde, p.sectie, p.perceelnummer].filter((v) => v !== undefined).join(" "),
        areaM2: p.kadastrale_grootte_waarde ?? polygonArea(f.geometry.coordinates[0]![0]!.map((c) => [c[0]!, c[1]!] as [number, number])),
        polygons: f.geometry.coordinates.map((poly) => poly.map(toLonLat)),
      },
      maxDimM: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
      centreRd: { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 },
    };
  }
  return null;
}

/** One address → its point, parcel and the buildings around it, every upstream answer through the disk cache. */
export async function fetchPlot(
  id: string,
  deps: { cacheRoot: string; mode: CacheMode; fetchImpl?: typeof fetch; dir?: string; radiusM?: number },
): Promise<Plot | null> {
  const fetchJson: JsonFetcher = createJsonFetcher({ cacheRoot: deps.cacheRoot, dir: deps.dir ?? "_adhoc", mode: deps.mode, fetchImpl: deps.fetchImpl });
  const lookup = new URLSearchParams({ id, fl: "id,weergavenaam,centroide_rd,centroide_ll" });
  const doc = docsOf(await fetchJson("locatieserver", `${BASE}/lookup?${lookup}`))[0];
  const rd = doc?.centroide_rd ? parseWktPoint(doc.centroide_rd) : null;
  if (!doc?.weergavenaam || !rd) return null;
  const ll = doc.centroide_ll ? parseWktPoint(doc.centroide_ll) : null;
  const point: [number, number] = ll ? [ll.x, ll.y] : rdToWgs84(rd.x, rd.y);

  const found = parseParcelFeature(await fetchJson("kadaster", parcelUrl(rd)), rd);
  const frameM = frameFor(found?.maxDimM ?? null);
  // everything is fetched around the parcel's centre, where the views are centred (a large parcel's address point can lie
  // hundreds of metres off it); the site model asks for a wider radius (its surroundings fill the window and can be panned)
  const at = found?.centreRd ?? rd;
  const radius = deps.radiusM ?? plotRadius(frameM);
  const bag = new Bag3dContextProvider(fetchJson);
  const [buildings, ground] = await Promise.all([bag.buildingsNear(at, radius), groundSurfaces(fetchJson, at.x, at.y, radius)]);
  const minArea = minFootprintM2(frameM);
  return {
    id,
    label: doc.weergavenaam,
    point,
    parcel: found?.parcel ?? null,
    frameM,
    centre: rdToWgs84(at.x, at.y),
    radiusM: radius,
    buildings: buildings.filter((b) => !minArea || polygonArea(b.ring) >= minArea).map((b) => ({ id: b.id, ring: toLonLat(b.ring), height: b.height })),
    ground,
  };
}
