import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { geoRoutes } from "../routes/geo";
import { bgtUrl, groundSurfaces, mergePolygons, polygonsOf, simplifyRing } from "./plotContext";
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

describe("plot context", () => {
  const sq = (x: number, y: number) => [[[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]]];

  it("reads Polygon and MultiPolygon features as lon/lat polygons, nothing else", () => {
    expect(polygonsOf({ geometry: { type: "Polygon", coordinates: sq(85000, 446000) } })).toHaveLength(1);
    const multi = polygonsOf({ geometry: { type: "MultiPolygon", coordinates: [sq(85000, 446000), sq(85050, 446000)] } });
    expect(multi).toHaveLength(2);
    expect(multi[0]![0]![0]![0]).toBeGreaterThan(4);
    expect(polygonsOf({ geometry: { type: "Point", coordinates: [1, 2] } })).toEqual([]);
    expect(polygonsOf({})).toEqual([]);
  });

  it("simplifies dense rings without moving them more than the tolerance, and keeps closed rings closed", () => {
    // a 10 × 10 square whose sides carry a point every 0.5 m, plus a 1 cm wobble
    const ring: number[][] = [];
    for (let i = 0; i < 20; i++) ring.push([i * 0.5, i % 2 ? 0.01 : 0]);
    ring.push([10, 0], [10, 10], [0, 10], [0, 0]);
    const out = simplifyRing(ring, 0.05);
    expect(out[0]).toEqual(out[out.length - 1]);
    expect(out.length).toBeLessThanOrEqual(6);
    for (const c of out) expect(ring.some((p) => p[0] === c[0] && p[1] === c[1])).toBe(true);
    expect(simplifyRing([[0, 0], [1, 0], [1, 1], [0, 0]], 0.05)).toHaveLength(4); // a triangle stays
  });

  it("merges adjacent road pieces into one shape and drops slivers", () => {
    const sq = (x: number, y: number, s = 10) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
    // two touching 10 × 10 pieces become one 20 × 10 polygon; a 2 × 2 piece (4 m²) elsewhere is dropped
    const merged = mergePolygons([sq(0, 0), sq(10, 0), sq(100, 100, 2)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]![0]!.length).toBeLessThanOrEqual(6);
    const xs = merged[0]![0]!.map((c) => c[0]!);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 20]);
    expect(mergePolygons([])).toEqual([]);
  });

  it("asks only for carriageways of the road parts", () => {
    const u = decodeURIComponent(bgtUrl("wegdeel", 85000, 446000, 100).replaceAll("+", " "));
    expect(u).toContain("functie LIKE 'rijbaan%' OR functie = 'woonerf'");
    expect(decodeURIComponent(bgtUrl("waterdeel", 85000, 446000, 100).replaceAll("+", " "))).not.toContain("functie");
  });

  it("asks BGT only for current, ground-level objects", () => {
    const u = decodeURIComponent(bgtUrl("waterdeel", 85000, 446000, 100).replaceAll("+", " "));
    expect(u).toContain("/collections/waterdeel/items");
    expect(u).toContain("eind_registratie IS NULL AND relatieve_hoogteligging = 0");
    expect(u).toContain("filter-lang=cql2-text");
    expect(u).toContain("bbox=84900,445900,85100,446100");
  });

  it("collects BGT water from both water collections, following next links; roads come from wegdeel only", async () => {
    const calls: string[] = [];
    const fetchJson = async (provider: string, url: string) => {
      calls.push(provider + " " + url);
      if (url.includes("/waterdeel/")) return { features: [{ geometry: { type: "Polygon", coordinates: sq(85000, 446020) } }], links: [{ rel: "next", href: "https://x/page2" }] };
      if (url === "https://x/page2") return { features: [{ geometry: { type: "Polygon", coordinates: sq(85020, 446020) } }] };
      if (url.includes("/ondersteunendwaterdeel/")) return { features: [{ geometry: { type: "Polygon", coordinates: sq(85040, 446020) } }] };
      return { features: [] };
    };
    const ground = await groundSurfaces(fetchJson, 85005, 446005, 100);
    expect(ground.water).toHaveLength(3); // both pages and the supporting water
    expect(Object.keys(ground)).toEqual(["road", "water"]); // no paving, green or yards
    expect(calls.filter((c) => c.startsWith("bgt"))).toHaveLength(4); // wegdeel + 2 water collections + the second page
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
    // margins of the parcel's own size up to 150 m a side; no upper limit, so a large parcel always fits
    expect(frameFor(200)).toBe(500);
    expect(frameFor(1000)).toBe(1300);
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
    expect(body.ground).toEqual({ road: [], water: [] });
    expect(body.parcel.polygons).toHaveLength(2);
    const n = calls.length;
    await app.request(`/plot?id=${id}`);
    expect(calls).toHaveLength(n); // all three upstream answers came from the disk cache
    expect((await app.request("/plot?id=nope")).status).toBe(400);
    // the surroundings are fetched around the parcel's centre (x 85000–85040 → 85020), not the address point (85005)
    expect(body.radiusM).toBe(Math.round(120 * 0.95));
    // a wider context radius asks 3DBAG for a wider box; out-of-range radii are refused
    await app.request(`/plot?id=${id}&r=250`);
    expect(calls.slice(n).some((u) => u.includes("3dbag") && u.includes("bbox=84770"))).toBe(true);
    expect((await app.request(`/plot?id=${id}&r=5000`)).status).toBe(400);
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

describe("BGT tiles", () => {
  it("keeps a small box whole and covers a large one with an even grid", async () => {
    const { bgtTiles } = await import("./plotContext");
    expect(bgtTiles(0, 0, 300)).toEqual([{ x: 0, y: 0, r: 300 }]);
    const t = bgtTiles(0, 0, 1200); // 2400 m → 3 × 3 tiles of 800 m
    expect(t).toHaveLength(9);
    expect(t[0]).toEqual({ x: -800, y: -800, r: 400 });
    expect(t[8]).toEqual({ x: 800, y: 800, r: 400 });
  });
});
