import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resetTileJson } from "../geo/tiles";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { clampBbox, parseRoads } from "../geo/osm";
import { geoRoutes } from "./geo";

/** A config whose cache root sits in a temp dir that has a data/cities next to it. */
async function setup(mode: "readwrite" | "offline" = "readwrite") {
  const root = await mkdtemp(path.join(tmpdir(), "geo-"));
  const cacheRoot = path.join(root, "cache");
  await mkdir(path.join(root, "cities"), { recursive: true });
  await writeFile(path.join(root, "cities", "PL.json"), JSON.stringify([{ n: "Warsaw", a: ["Warszawa"], y: 52.23, x: 21.01, p: 1702139 }]));
  return { config: { ...loadConfig({}), cacheRoot, cacheMode: mode }, cacheRoot };
}

const nominatim = [
  {
    lat: "52.2333742",
    lon: "21.0711489",
    boundingbox: ["52.0978497", "52.3681531", "20.8516882", "21.2711512"],
    geojson: { type: "Polygon", coordinates: [[[20.85, 52.2], [21.27, 52.2], [21.27, 52.36], [20.85, 52.2]]] },
  },
  { lat: "50.0", lon: "10.0", boundingbox: ["49", "51", "9", "11"], geojson: { type: "Point", coordinates: [10, 50] } },
];

const overpassRoads = {
  elements: [
    { tags: { h: "primary" }, geometry: [{ lat: 52.2, lon: 21.0 }, { lat: 52.21, lon: 21.01 }] },
    { tags: { h: "motorway" }, geometry: [{ lat: 52.3, lon: 21.0 }] }, // a single point: dropped
  ],
};

const fakeFetch = (calls: string[]): typeof fetch =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("nominatim")) return new Response(JSON.stringify(nominatim));
    const q = String((init?.body as URLSearchParams).get("data"));
    return new Response(JSON.stringify(q.includes("highway") ? overpassRoads : { elements: [] }));
  }) as typeof fetch;

describe("geo routes", () => {
  it("serves the city list of a country, and an empty list for an unknown one", async () => {
    const { config } = await setup();
    const app = geoRoutes(config);
    const res = await app.request("/cities/pl");
    expect(await res.json()).toEqual([expect.objectContaining({ n: "Warsaw" })]);
    expect(await (await app.request("/cities/zz")).json()).toEqual([]);
    expect((await app.request("/cities/1")).status).toBe(400);
  });

  it("returns the boundary nearest the expected place and caches it", async () => {
    const { config, cacheRoot } = await setup();
    const calls: string[] = [];
    const app = geoRoutes(config, { fetchImpl: fakeFetch(calls) });
    const url = "/boundary?name=Warsaw&cc=PL&lat=52.2298&lon=21.0118";
    const body = (await (await app.request(url)).json()) as any;
    expect(body).toMatchObject({ source: "osm", bbox: { s: 52.0978497, n: 52.3681531, w: 20.8516882, e: 21.2711512 } });
    expect(body.polygon.type).toBe("Polygon");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("countrycodes=pl");
    await app.request(url);
    expect(calls).toHaveLength(1); // second answer from the disk cache
    expect(await readdir(path.join(cacheRoot, "_geo"))).toHaveLength(1);
  });

  it("falls back to a box when OSM has no polygon, and rejects bad requests", async () => {
    const { config } = await setup();
    const empty: typeof fetch = (async () => new Response("[]")) as typeof fetch;
    const app = geoRoutes(config, { fetchImpl: empty });
    const body = (await (await app.request("/boundary?name=Nowhere&cc=PL&lat=52&lon=21")).json()) as any;
    expect(body).toMatchObject({ source: "none", polygon: null });
    expect((await app.request("/boundary?name=x&cc=PL")).status).toBe(400);
  });

  it("returns roads (classified, single points dropped) and caches them; offline misses answer 503", async () => {
    const { config } = await setup();
    const calls: string[] = [];
    const app = geoRoutes(config, { fetchImpl: fakeFetch(calls) });
    const body = (await (await app.request("/details?s=52.2&w=20.9&n=52.3&e=21.1")).json()) as any;
    expect(body.roads).toEqual([{ c: 1, p: [[21, 52.2], [21.01, 52.21]] }]);
    expect(body.water).toEqual([]);

    const offline = await setup("offline");
    expect((await geoRoutes(offline.config).request("/details?s=52.2&w=20.9&n=52.3&e=21.1")).status).toBe(503);
  });

  it("returns streets with their class (links folded, single points dropped), queries a clamped box and caches; offline 503", async () => {
    const { config } = await setup();
    const calls: string[] = [];
    const queries: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      queries.push(String((init?.body as URLSearchParams).get("data")));
      return new Response(
        JSON.stringify({
          elements: [
            { tags: { h: "residential" }, geometry: [{ lat: 52.0001234, lon: 4.3701234 }, { lat: 52.001, lon: 4.371 }] },
            { tags: { h: "tertiary_link" }, geometry: { type: "LineString", coordinates: [[4.37, 52], [4.372, 52.002]] } },
            { tags: { h: "footway" }, geometry: [{ lat: 52, lon: 4.37 }] },
            { geometry: [{ lat: 52, lon: 4.37 }, { lat: 52.1, lon: 4.38 }] },
          ],
        }),
      );
    }) as typeof fetch;
    const app = geoRoutes(config, { fetchImpl });
    const url = "/streets?s=51.9&w=4.3&n=52.1&e=4.5";
    const body = (await (await app.request(url)).json()) as any;
    expect(body).toEqual([
      { h: "residential", p: [[4.370123, 52.000123], [4.371, 52.001]] },
      { h: "tertiary", p: [[4.37, 52], [4.372, 52.002]] },
    ]);
    // 0.2° asked, 0.03° queried around the centre
    expect(queries[0]).toContain("(51.98500,4.38500,52.01500,4.41500)");
    await app.request(url);
    expect(calls).toHaveLength(1);
    expect((await app.request("/streets?s=1&w=2")).status).toBe(400);
    const offline = await setup("offline");
    expect((await geoRoutes(offline.config).request(url)).status).toBe(503);
  });

  it("returns water and borders from the vector tiles, cached; offline misses answer 503, bad boxes 400", async () => {
    resetTileJson();
    const { config } = await setup();
    const fixture = await readFile(path.join(__dirname, "..", "geo", "fixtures", "tile-14-7844-6566.pbf"));
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/planet")) return new Response(JSON.stringify({ tiles: ["https://t.example/{z}/{x}/{y}.pbf"] }));
      return new Response(fixture);
    }) as unknown as typeof fetch;
    const app = geoRoutes(config, { fetchImpl });
    const url = "/tiles?s=33.6&w=-7.652&n=33.6025&e=-7.6515";
    const body = (await (await app.request(url)).json()) as any;
    expect(body.z).toBe(14);
    expect(body.water.length).toBeGreaterThan(0);
    expect(Array.isArray(body.borders)).toBe(true);
    const n = calls.length;
    await app.request(url);
    expect(calls).toHaveLength(n); // the second answer comes from the disk cache
    expect((await app.request("/tiles?s=1")).status).toBe(400);
    const offline = await setup("offline");
    expect((await geoRoutes(offline.config).request(url)).status).toBe(503);
  });
});
