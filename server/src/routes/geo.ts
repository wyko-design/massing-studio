import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { CacheMissError } from "../cache/diskCache";
import type { ServerConfig } from "../config";
import { cachedJson } from "../geo/cache";
import { fetchPlot, municipalityAt, suggestAddresses } from "../geo/address";
import { clampBbox, fetchBoundary, fetchDetails } from "../geo/osm";
import { fetchTileData } from "../geo/tiles";

/** Widest box for the tiles: 1.3 × the frame of the largest countries (a city's is up to ~3°). */
const TILES_SPAN_DEG = 120;

export type GeoDeps = { fetchImpl?: typeof fetch };

/** City list, city boundary and map details for the landing's city step. */
export function geoRoutes(config: ServerConfig, deps: GeoDeps = {}) {
  const app = new Hono();
  const citiesRoot = path.join(config.cacheRoot, "..", "cities");

  /** Cities (15 000+ inhabitants) of one country, largest first. Static data, committed under data/cities. */
  app.get("/cities/:cc", async (c) => {
    const cc = c.req.param("cc").toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return c.json({ error: "Country code must be two letters." }, 400);
    try {
      const body = await readFile(path.join(citiesRoot, `${cc}.json`), "utf8");
      c.header("cache-control", "public, max-age=86400");
      return c.body(body, 200, { "content-type": "application/json" });
    } catch {
      return c.json([]); // no city of that size
    }
  });

  app.get("/boundary", async (c) => {
    const name = c.req.query("name");
    const cc = c.req.query("cc") ?? "";
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!name || !/^[A-Za-z]{2}$/.test(cc) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return c.json({ error: "name, cc, lat and lon are required." }, 400);
    }
    try {
      const key = `full|${cc.toUpperCase()}|${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
      return c.json(await cachedJson(config.cacheRoot, config.cacheMode, "boundary", key, () => fetchBoundary(name, cc, lat, lon, deps.fetchImpl)));
    } catch (e) {
      if (e instanceof CacheMissError) return c.json({ error: e.message }, 503);
      console.error(e);
      return c.json({ error: "Could not load the city boundary." }, 502);
    }
  });

  app.get("/details", async (c) => {
    const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(c.req.query(k))) as [number, number, number, number];
    if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e) return c.json({ error: "s, w, n and e are required." }, 400);
    const bbox = clampBbox({ s, w, n, e });
    try {
      const key = [bbox.s, bbox.w, bbox.n, bbox.e].map((v) => v.toFixed(4)).join(",");
      return c.json(await cachedJson(config.cacheRoot, config.cacheMode, "details", key, () => fetchDetails(bbox, deps.fetchImpl)));
    } catch (err) {
      if (err instanceof CacheMissError) return c.json({ error: err.message }, 503);
      console.error(err);
      return c.json({ error: "Could not load the map details." }, 502);
    }
  });

  /** Water polygons, shore and municipality borders for the city view (OpenFreeMap vector tiles), boxes up to 120°. */
  app.get("/tiles", async (c) => {
    const [s, w, n, e] = ["s", "w", "n", "e"].map((k) => Number(c.req.query(k))) as [number, number, number, number];
    if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e) return c.json({ error: "s, w, n and e are required." }, 400);
    const bbox = clampBbox({ s, w, n, e }, TILES_SPAN_DEG);
    // municipality borders (8) for a city, country borders only (2) for a country
    const maxLevel = Math.max(2, Math.min(8, Number(c.req.query("maxLevel")) || 8));
    try {
      const key = `v9|${maxLevel}|` + [bbox.s, bbox.w, bbox.n, bbox.e].map((v) => v.toFixed(4)).join(",");
      return c.json(await cachedJson(config.cacheRoot, config.cacheMode, "tiles", key, () => fetchTileData(bbox, deps.fetchImpl, maxLevel)));
    } catch (err) {
      if (err instanceof CacheMissError) return c.json({ error: err.message }, 503);
      console.error(err);
      return c.json({ error: "Could not load the map tiles." }, 502);
    }
  });

  /**
   * Address suggestions inside the municipality of the chosen city (Netherlands only). Not cached on disk
   * (one request per pause in typing); the municipality of a city centre is remembered in memory.
   */
  const municipalities = new Map<string, Promise<string | null>>();
  app.get("/address/suggest", async (c) => {
    const q = c.req.query("q") ?? "";
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return c.json({ error: "lat and lon are required." }, 400);
    if (q.length > 120) return c.json({ error: "Query too long." }, 400);
    try {
      const key = `${lat.toFixed(3)}|${lon.toFixed(3)}`;
      let municipality = municipalities.get(key);
      if (!municipality) {
        municipality = municipalityAt(lat, lon, deps.fetchImpl);
        municipality.catch(() => municipalities.delete(key));
        municipalities.set(key, municipality);
      }
      const place = await municipality;
      if (!place) return c.json({ municipality: null, items: [] });
      return c.json({ municipality: place, items: await suggestAddresses(q, place, deps.fetchImpl) });
    } catch (err) {
      console.error(err);
      return c.json({ error: "Could not load address suggestions." }, 502);
    }
  });

  /** One chosen address: its point, cadastral parcel and the BAG buildings around it. Cached per upstream request. */
  app.get("/plot", async (c) => {
    const id = c.req.query("id") ?? "";
    if (!/^adr-[0-9a-f]{32}$/.test(id)) return c.json({ error: "A Locatieserver address id is required." }, 400);
    try {
      const plot = await fetchPlot(id, { cacheRoot: config.cacheRoot, mode: config.cacheMode, fetchImpl: deps.fetchImpl });
      if (!plot) return c.json({ error: "Address not found." }, 404);
      return c.json(plot);
    } catch (err) {
      if (err instanceof CacheMissError) return c.json({ error: err.message }, 503);
      console.error(err);
      return c.json({ error: "Could not load the plot." }, 502);
    }
  });

  return app;
}
