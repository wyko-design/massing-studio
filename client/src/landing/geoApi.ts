import type { Geometry } from "geojson";
import type { PlotData } from "./globe/plotLayer";
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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return (await res.json()) as T;
}

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
export const fetchPlot = (id: string) => getJson<PlotData>(`/api/geo/plot?${new URLSearchParams({ id })}`);
