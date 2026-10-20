import type { Geometry } from "geojson";
import { clearParcel, type PlotData } from "./globe/plotLayer";
import { createMatcher, type CountryEntry, type Matcher } from "./countries/matcher";

/** A city of the GeoNames list (data/cities/<CC>.json, served by /api/geo/cities/<CC>). */
export type CityRow = { n: string; a: string[]; y: number; x: number; p: number };

export type Cities = { rows: CityRow[]; entries: CountryEntry[]; matcher: Matcher };

const cities = new Map<string, Promise<Cities>>();

/** Cities of a country (15 000+ inhabitants, largest first) with a matcher over their names; loaded once per country. */
export function loadCities(cc: string): Promise<Cities> {
  const key = cc.toUpperCase();
  let p = cities.get(key);
  if (!p) {
    p = fetch(`/api/geo/cities/${key}`)
      .then((r) => {
        if (!r.ok) throw new Error(`City list failed (${r.status})`);
        return r.json() as Promise<CityRow[]>;
      })
      .then((rows) => {
        // largest first: rank by position, so "w" suggests the biggest city starting with w
        const entries: CountryEntry[] = rows.map((c, i) => ({ id: String(i), name: c.n, alpha2: null, names: [c.n, ...c.a], aliases: [], rank: i }));
        return { rows, entries, matcher: createMatcher(entries) };
      });
    p.catch(() => cities.delete(key));
    cities.set(key, p);
  }
  return p;
}

export type Bbox = { s: number; w: number; n: number; e: number };

export type CityBoundary = {
  centre: [number, number];
  bbox: Bbox;
  polygon: Geometry | null;
  source: "osm" | "none";
};

export type MapDetails = {
  roads: { c: number; p: [number, number][] }[];
  water: [number, number][][];
};

const shared = new Map<string, Promise<unknown>>();
const SHARED_MAX = 32;

/**
 * One request per key: a later call (a prefetch picked up, a step back and forth) gets the same promise. A failure is
 * forgotten, so the next call tries again; the oldest answers drop out beyond `SHARED_MAX`.
 */
export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = shared.get(key);
  if (hit) {
    shared.delete(key);
    shared.set(key, hit);
    return hit as Promise<T>;
  }
  const p = load();
  shared.set(key, p);
  p.catch(() => shared.get(key) === p && shared.delete(key));
  while (shared.size > SHARED_MAX) shared.delete(shared.keys().next().value!);
  return p;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

const getJson = <T>(url: string) => once(url, () => fetchJson<T>(url));

export const fetchBoundary = (city: CityRow, cc: string) =>
  getJson<CityBoundary>(`/api/geo/boundary?${new URLSearchParams({ name: city.n, cc, lat: String(city.y), lon: String(city.x) })}`);

export const fetchDetails = (b: Bbox) =>
  getJson<MapDetails>(`/api/geo/details?${new URLSearchParams({ s: String(b.s), w: String(b.w), n: String(b.n), e: String(b.e) })}`);

/** Water, shore and municipality borders of a box (OpenFreeMap vector tiles, through the server). */
export type TileData = {
  z: number;
  /** [outer ring, ...holes] of [lon, lat]. */
  water: [number, number][][][];
  borders: { l: number; p: [number, number][] }[];
};

/** `maxLevel`: 8 = municipality borders (a city), 2 = country borders only (a country). */
export const fetchTiles = (b: Bbox, maxLevel = 8) =>
  getJson<TileData>(`/api/geo/tiles?${new URLSearchParams({ s: String(b.s), w: String(b.w), n: String(b.n), e: String(b.e), maxLevel: String(maxLevel) })}`);

/** One address suggestion: Locatieserver id, display name and address point. */
export type AddressSuggestion = { id: string; label: string; lon: number; lat: number };

/** Suggestions for the typed text inside the municipality of a city centre (Netherlands). `items` is empty outside it. */
export async function fetchAddressSuggestions(q: string, lat: number, lon: number, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ q, lat: String(lat), lon: String(lon) });
  const res = await fetch(`/api/geo/address/suggest?${params}`, { signal });
  if (!res.ok) throw new Error(`Address suggestions failed (${res.status})`);
  return ((await res.json()) as { items: AddressSuggestion[] }).items;
}

/** The chosen address's point, parcel and surrounding buildings. */
export const fetchPlot = (id: string) => {
  const url = `/api/geo/plot?${new URLSearchParams({ id })}`;
  return once(`clear|${url}`, () => fetchJson<PlotData>(url).then(clearParcel));
};

/** The same plot with its surroundings out to `radiusM` (the site model). */
export const fetchPlotContext = (id: string, radiusM: number) => {
  const url = `/api/geo/plot?${new URLSearchParams({ id, r: String(radiusM) })}`;
  return once(`clear|${url}`, () => fetchJson<PlotData>(url).then(clearParcel));
};

/** OpenStreetMap streets and paths of a small box: highway class and [lon, lat] points. */
export const fetchStreets = (b: Bbox) =>
  getJson<{ h: string; p: [number, number][] }[]>(`/api/geo/streets?${new URLSearchParams({ s: String(b.s), w: String(b.w), n: String(b.n), e: String(b.e) })}`);

/** The address without its trailing place name ("Hendrik Casimirstraat 8, 2628KJ Delft" → "…8, 2628KJ"; without a postcode "…, Delft" is dropped). */
export function shortAddress(label: string): string {
  const i = label.lastIndexOf(", ");
  if (i < 0) return label;
  const tail = label.slice(i + 2);
  const postcode = /^\d{4} ?[A-Z]{2}\b/.exec(tail);
  return postcode ? label.slice(0, i + 2) + postcode[0] : label.slice(0, i);
}
