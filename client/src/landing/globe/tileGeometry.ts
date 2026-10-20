import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Position } from "geojson";
import { asMultiPolygon, cleanPolygons } from "./cityGeo";
import { closePolygons } from "./closing";

/**
 * The polygon work on a level's map tiles, as pure functions (no renderer state), so it can run in a worker: unions and
 * differences over every water body took ~400 ms on the main thread when a country was picked, freezing the pan.
 */

/**
 * The tiles' water polygons merged into one outline set: tile pieces and overlapping features (river + dock + basin)
 * become single bodies, so there are no seams, doubled lines or tile-edge lines; slivers, spikes and tiny holes are dropped.
 */
export function mergeWater(water: Position[][][], pxDeg: number): Position[][][] {
  try {
    const [first, ...rest] = water;
    if (!first) return [];
    // only substantial bodies stay: at the final frame at least ~8 px wide and 1 500 px² (the sea is far bigger); islands 4 px and 100 px²
    return cleanPolygons(polygonClipping.union(first as never, ...(rest as never[])), pxDeg, {
      outer: { area: 1500, width: 8 },
      hole: { area: 100, width: 4 },
    });
  } catch {
    return water;
  }
}

/** The water bodies with the country's own area cut out; all of them when the clipping fails. */
export function waterOutside(country: MultiPolygon, water: Position[][][], pxDeg: number): Position[][][] {
  if (!water.length) return water;
  try {
    return cleanPolygons(polygonClipping.difference(water as never, country.coordinates as never), pxDeg);
  } catch {
    return water;
  }
}

/** The city polygon minus the water of the tiles; the polygon itself when the clipping fails or leaves nothing. */
export function landOnly(city: MultiPolygon, water: Position[][][], pxDeg: number): MultiPolygon {
  try {
    const out = polygonClipping.difference(city.coordinates as never, ...(water as never[]));
    const clean = cleanPolygons(out, pxDeg);
    return clean.length ? asMultiPolygon({ type: "MultiPolygon", coordinates: clean }) : city;
  } catch {
    return city;
  }
}

export type TileJob =
  | { kind: "country"; geometry: MultiPolygon; water: Position[][][]; pxDeg: number }
  | { kind: "city"; geometry: MultiPolygon; water: Position[][][]; pxDeg: number };

export type CountryTiles = { closed: MultiPolygon; water: Position[][][] };
export type CityTiles = { water: Position[][][]; land: MultiPolygon };

/**
 * Country level: inlets, estuaries and gaps up to ~12 px wide at the final frame are closed (they read as land), and only
 * the water outside that closed outline is kept, so the grey shore along the country is the polygon's own edge.
 */
export function countryTiles(geometry: MultiPolygon, water: Position[][][], pxDeg: number): CountryTiles {
  const closed = asMultiPolygon({ type: "MultiPolygon", coordinates: closePolygons(geometry.coordinates, 6 * pxDeg) });
  return { closed, water: waterOutside(closed, mergeWater(water, pxDeg), pxDeg) };
}

/** City level: the merged water, and the city as its land (water cut out, so its outline follows the shore). */
export function cityTiles(geometry: MultiPolygon, water: Position[][][], pxDeg: number): CityTiles {
  const merged = mergeWater(water, pxDeg);
  return { water: merged, land: landOnly(geometry, merged, pxDeg) };
}

export function runTileJob(job: TileJob): CountryTiles | CityTiles {
  return job.kind === "country" ? countryTiles(job.geometry, job.water, job.pxDeg) : cityTiles(job.geometry, job.water, job.pxDeg);
}
