import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { geoRoutes } from "../routes/geo";
import { bestCollation, fetchPlot, frameFor, normaliseQuery, parseParcelFeature, suggestAddresses } from "./address";

const doc = (id: string, label: string, ll = "POINT(4.377 52.0035)") => ({ id, weergavenaam: label, centroide_ll: ll });
const answer = (docs: unknown[], collations: unknown[] = []) => ({ response: { docs }, spellcheck: { collations } });

/** Fake PDOK: `suggest` answers by query text, `free` is the fuzzy fallback. */
function fakePdok(calls: string[]): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    calls.push(u.pathname.split("/").pop() + "?" + (u.searchParams.get("q") ?? u.searchParams.get("id") ?? ""));
    const q = u.searchParams.get("q") ?? "";
    const body = u.pathname.endsWith("/reverse")
      ? answer([{ gemeentenaam: "Delft" }])
      : u.pathname.endsWith("/suggest") && q === "hendrik casim"
        ? answer([doc("adr-a", "Hendrik Casimirstraat 8, 2628KJ Delft")])
        : u.pathname.endsWith("/suggest") && q === "hendrik casimirtsr"
          ? answer([], ["collation", { collationQuery: "hendrik casimirstra", hits: 25 }, "collation", { collationQuery: "hendrik casimirstr", hits: 3 }])
          : u.pathname.endsWith("/suggest") && q === "hendrik casimirstra"
            ? answer([doc("adr-b", "Hendrik Casimirstraat 2, 2628KJ Delft")])
            : u.pathname.endsWith("/free")
              ? answer([doc("adr-c", "Free Result 1, Delft")])
              : answer([]);
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
}

describe("address suggestions", () => {
  it("cleans the query of Solr operators and blanks", () => {
    expect(normaliseQuery('  hendrik  "casim*" (8)  ')).toBe("hendrik casim 8");
  });

  it("suggests inside the municipality, with the address point", async () => {
    const calls: string[] = [];
    const items = await suggestAddresses("hendrik casim", "Delft", fakePdok(calls));
    expect(items).toEqual([{ id: "adr-a", label: "Hendrik Casimirstraat 8, 2628KJ Delft", lon: 4.377, lat: 52.0035 }]);
    expect(calls).toEqual(["suggest?hendrik casim"]);
  });

  it("repairs a typo with the best spell-check collation before falling back to free search", async () => {
    const calls: string[] = [];
    const items = await suggestAddresses("hendrik casimirtsr", "Delft", fakePdok(calls));
    expect(items.map((i) => i.label)).toEqual(["Hendrik Casimirstraat 2, 2628KJ Delft"]);
    expect(calls).toEqual(["suggest?hendrik casimirtsr", "suggest?hendrik casimirstra"]);
  });

  it("falls back to free search when nothing else answers, and asks for nothing under two characters", async () => {
    const calls: string[] = [];
    expect((await suggestAddresses("qq", "Delft", fakePdok(calls))).map((i) => i.label)).toEqual(["Free Result 1, Delft"]);
    expect(calls).toEqual(["suggest?qq", "free?qq"]);
    expect(await suggestAddresses("q", "Delft", fakePdok(calls))).toEqual([]);
  });

  it("picks the collation with the most hits", () => {
    expect(bestCollation(answer([], ["collation", { collationQuery: "a", hits: 1 }, "collation", { collationQuery: "b", hits: 9 }]))).toBe("b");
    expect(bestCollation(answer([]))).toBeNull();
  });
});

describe("plot", () => {
  // two pieces of one parcel (a MultiPolygon), RD metres; the address point is inside the first
  const piece = (x: number, y: number) => [[[x, y], [x + 10, y], [x + 10, y + 20], [x, y + 20], [x, y]]];
  const feature = {
    properties: { sectie: "K", perceelnummer: 2410, akr_kadastrale_gemeente_code_waarde: "DEL00", kadastrale_grootte_waarde: 111 },
    geometry: { type: "MultiPolygon", coordinates: [piece(85000, 446000), piece(85030, 446000)] },
  };

  it("keeps every polygon of the parcel under the point, in lon/lat", () => {
    const got = parseParcelFeature({ features: [feature] }, { x: 85005, y: 446010 });
    expect(got?.parcel.id).toBe("DEL00 K 2410");
    expect(got?.parcel.polygons).toHaveLength(2);
    expect(got?.maxDimM).toBe(40); // both pieces: 85000 → 85040
    const [lon, lat] = got!.parcel.polygons[0]![0]![0]!;
    expect(lon).toBeGreaterThan(4);
    expect(lat).toBeGreaterThan(51);
    expect(parseParcelFeature({ features: [feature] }, { x: 90000, y: 446010 })).toBeNull();
  });

  it("frames three times the parcel, between 90 and 600 m", () => {
    expect(frameFor(null)).toBe(90);
    expect(frameFor(20)).toBe(90);
    expect(frameFor(50)).toBe(150);
    expect(frameFor(1000)).toBe(600);
  });

  it("serves the plot route: point, parcel, buildings; caches upstream answers; refuses bad ids; offline misses answer 503", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "plot-"));
    const config = { ...loadConfig({}), cacheRoot: path.join(root, "cache") };
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/lookup")) return new Response(JSON.stringify(answer([{ id: "x", weergavenaam: "Hendrik Casimirstraat 8, 2628KJ Delft", centroide_rd: "POINT(85005 446010)", centroide_ll: "POINT(4.377 52.0035)" }])));
      if (u.includes("brk-kadastrale-kaart")) return new Response(JSON.stringify({ features: [feature] }));
      return new Response(JSON.stringify({ metadata: { transform: { scale: [1, 1, 1], translate: [0, 0, 0] } }, features: [], links: [] }));
    }) as typeof fetch;
    const app = geoRoutes(config, { fetchImpl });
    const id = "adr-" + "a".repeat(32);
    const body = (await (await app.request(`/plot?id=${id}`)).json()) as any;
    expect(body).toMatchObject({ label: "Hendrik Casimirstraat 8, 2628KJ Delft", point: [4.377, 52.0035], frameM: 120, buildings: [] });
    expect(body.parcel.polygons).toHaveLength(2);
    const n = calls.length;
    await app.request(`/plot?id=${id}`);
    expect(calls).toHaveLength(n); // all three upstream answers came from the disk cache
    expect((await app.request("/plot?id=nope")).status).toBe(400);
    const offline = geoRoutes({ ...config, cacheMode: "offline", cacheRoot: path.join(root, "empty") }, { fetchImpl });
    expect((await offline.request(`/plot?id=${id}`)).status).toBe(503);
    expect(await fetchPlot(id, { cacheRoot: config.cacheRoot, mode: "offline", fetchImpl })).not.toBeNull();
  });

  it("answers suggestions with the municipality of the city centre", async () => {
    const config = loadConfig({});
    const app = geoRoutes(config, { fetchImpl: fakePdok([]) });
    const body = (await (await app.request("/address/suggest?q=hendrik%20casim&lat=52.0116&lon=4.3571")).json()) as any;
    expect(body.municipality).toBe("Delft");
    expect(body.items).toHaveLength(1);
    expect((await app.request("/address/suggest?q=x")).status).toBe(400);
  });
});
