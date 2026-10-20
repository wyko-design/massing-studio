import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assumedFields, type Parcel } from "@massing/shared";
import { FirstZoningProvider } from "../firstZoning";
import {
  RuimtelijkePlannenZoningProvider,
  constraintsFromPlan,
  municipalPlans,
  parseMaatvoeringen,
  mergeDetails,
  parseWkt,
  pointInside,
  samplePoints,
} from "./ruimtelijkePlannen";

const fx = (name: string) => JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8")) as unknown;
const plans = fx("rp-plans-wippolder.json");
type Zoning = { maatvoeringen: Record<string, unknown>[] } & Record<string, unknown>;
const zoning = fx("rp-zoning-wippolder.json") as Zoning;
const empty = fx("rp-zoning-empty.json");

/** Square parcel around the recorded Wippolder point (RD). */
const parcel: Parcel = {
  id: "DEL00 X 1",
  areaM2: 400,
  indicative: true,
  ring: [
    [85090, 446390],
    [85110, 446390],
    [85110, 446410],
    [85090, 446410],
  ],
};

describe("parsers", () => {
  it("reads polygons with holes and multipolygons from WKT", () => {
    expect(parseWkt("POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 2, 1 1))")).toEqual([
      [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
      ],
    ]);
    expect(parseWkt("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))")).toHaveLength(2);
    expect(parseWkt("POINT (1 2)")).toEqual([]);
  });

  it("reads a maatvoering value, with decimal comma", () => {
    expect(parseMaatvoeringen('"maximum bouwhoogte (m)"="18"')).toEqual([{ label: "maximum bouwhoogte (m)", value: 18, quote: '"maximum bouwhoogte (m)"="18"' }]);
    expect(parseMaatvoeringen('"maximum goothoogte (m)"="6,5"')[0]?.value).toBe(6.5);
    expect(parseMaatvoeringen("geen getal")).toEqual([]);
    expect(parseMaatvoeringen('"inhoud"="abc"')).toEqual([]);
  });

  it("reads several pairs packed into one maatvoering (seen in plan BP0005)", () => {
    const raw = '"maximum bebouwingspercentage terrein (%)"="74", "maximum bouwhoogte (m)"="20", "maximum goothoogte (m)"="20"';
    expect(parseMaatvoeringen(raw).map((p) => p.value)).toEqual([74, 20, 20]);
  });

  it("maps packed values onto height, gutter height and coverage", () => {
    const plan = municipalPlans(plans)[0]!;
    const packed = {
      maatvoeringen: [{ maatvoering: '"maximum bebouwingspercentage terrein (%)"="74", "maximum bouwhoogte (m)"="20", "maximum goothoogte (m)"="9"' }],
    };
    const c = constraintsFromPlan(plan, packed as never, [0, 0]);
    expect([c.maxHeight.value, c.maxGutterHeight?.value, c.maxCoverage?.value]).toEqual([20, 9, 0.74]);
    expect(c.maxGutterHeight?.prov.quote).toBe('"maximum goothoogte (m)"="9"');
  });

  it("finds a point inside a concave parcel when the centroid is outside", () => {
    const u: [number, number][] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
    const p = pointInside(u)!;
    expect(p).not.toBeNull();
    expect(p[1]).toBeLessThan(10);
  });
});

describe("plan list", () => {
  it("keeps adopted municipal bestemmingsplannen in the zoning table format, newest first", () => {
    const list = municipalPlans(plans);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.sourceTable === "bestemmplangebied")).toBe(true);
    expect(list.map((p) => p.datum)).toEqual([...list.map((p) => p.datum)].sort().reverse());
    expect(list.some((p) => p.identificatie === "NL.IMRO.0503.BP0021-2001")).toBe(true);
  });
});

describe("constraintsFromPlan", () => {
  const plan = municipalPlans(plans).find((p) => p.identificatie === "NL.IMRO.0503.BP0021-2001")!;
  const c = constraintsFromPlan(plan, zoning, [85100, 446400]);

  it("fills height, coverage, bestemming and bouwvlak from the plan, with quotes", () => {
    expect(c.maxHeight.value).toBe(18);
    expect(c.maxHeight.prov).toMatchObject({ status: "extracted", quote: '"maximum bouwhoogte (m)"="18"' });
    expect(c.maxCoverage?.value).toBe(0.6);
    expect(c.allowedFunctions.value).toEqual(["Social"]);
    expect(c.bouwvlak?.value?.type).toBe("Polygon");
    expect(c.bouwvlak!.value!.coordinates[0]!.length).toBeGreaterThan(3);
  });

  it("leaves what the plan does not give unknown and assumed, so the placeholder state stays on", () => {
    expect(c.maxGutterHeight?.value).toBeNull();
    expect(c.setbacks.street.value).toBeNull();
    expect(assumedFields(c)).toEqual(expect.arrayContaining(["maxGutterHeight", "setbacks.street", "maxFAR"]));
    expect(assumedFields(c)).not.toContain("maxHeight");
  });

  it("always warns that the values were read at one point", () => {
    expect(c.notes.some((n) => /point/.test(n.value ?? ""))).toBe(true);
  });

  it("uses the lowest of several heights and says so", () => {
    const two = { ...zoning, maatvoeringen: [...zoning.maatvoeringen, { ...zoning.maatvoeringen[0], maatvoering: '"maximum bouwhoogte (m)"="12"' }] };
    const m = constraintsFromPlan(plan, two as never, [85100, 446400]);
    expect(m.maxHeight.value).toBe(12);
    expect(m.notes.some((n) => /lowest/.test(n.value ?? ""))).toBe(true);
  });

  it("ignores historic objects", () => {
    const old = { ...zoning, maatvoeringen: zoning.maatvoeringen.map((o) => ({ ...o, historisch: true })) };
    expect(constraintsFromPlan(plan, old as never, [85100, 446400]).maxHeight.value).toBeNull();
  });
});

describe("RuimtelijkePlannenZoningProvider", () => {
  const fetcher = (responses: Record<string, unknown>) => async (_p: string, url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected ${url}`);
    return responses[key];
  };

  it("skips umbrella plans with empty zoning and returns the plan that has data", async () => {
    const provider = new RuimtelijkePlannenZoningProvider(
      fetcher({ "/plannen/xy/": plans, "BP0021-2001": zoning, "BP0091-2001": empty, "BP0060-2001": empty }),
    );
    const r = await provider.constraintsFor(parcel);
    expect(r?.fixtureId).toBe("ruimtelijkeplannen:NL.IMRO.0503.BP0021-2001");
    expect(r?.label).toMatch(/ruimtelijkeplannen\.nl/);
    expect(r?.constraints.maxHeight.value).toBe(18);
  });

  it("returns null when no plan has structured data at the point", async () => {
    const provider = new RuimtelijkePlannenZoningProvider(fetcher({ "/plannen/xy/": plans, "/bestemmplangebied/": empty }));
    expect(await provider.constraintsFor(parcel)).toBeNull();
  });
});

describe("FirstZoningProvider", () => {
  const ok = { fixtureId: "a", constraints: {} as never };
  it("takes the first answer, and treats a failing provider as no answer", async () => {
    const seen: unknown[] = [];
    const p = new FirstZoningProvider(
      [{ constraintsFor: async () => { throw new Error("offline"); } }, { constraintsFor: async () => null }, { constraintsFor: async () => ok }, { constraintsFor: async () => ({ ...ok, fixtureId: "b" }) }],
      (e) => seen.push(e),
    );
    expect((await p.constraintsFor(parcel))?.fixtureId).toBe("a");
    expect(seen).toHaveLength(1);
  });
});

describe("several points per plot", () => {
  const big: [number, number][] = [[0, 0], [40, 0], [40, 40], [0, 40]];

  it("samples a central point first, then up to four spread out, none closer than 3 m", () => {
    const pts = samplePoints(big);
    expect(pts[0]).toEqual([20, 20]);
    expect(pts.length).toBe(5);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThanOrEqual(3);
    expect(samplePoints([[0, 0], [4, 0], [4, 4], [0, 4]])).toHaveLength(1);
  });

  it("keeps each object once when the same one is read at several points", () => {
    const a = { id: 1, naam: "bouwvlak" };
    const merged = mergeDetails([{ bouwVlakken: [a], maatvoeringen: [{ id: 5, maatvoering: '"maximum bouwhoogte (m)"="10"' }] }, { bouwVlakken: [a, { id: 2 }] }]);
    expect(merged.bouwVlakken).toHaveLength(2);
    expect(merged.maatvoeringen).toHaveLength(1);
  });

  it("reads the plan at every point and merges what it finds", async () => {
    const seen: string[] = [];
    const left = { maatvoeringen: [{ id: 1, maatvoering: '"maximum bouwhoogte (m)"="12"' }], enkelBestemmingen: [{ id: 9, naam: "Wonen" }] };
    const right = { maatvoeringen: [{ id: 2, maatvoering: '"maximum bouwhoogte (m)"="9"' }] };
    const provider = new RuimtelijkePlannenZoningProvider(async (_p, url) => {
      if (url.includes("/plannen/xy/")) return plans;
      seen.push(url);
      if (!url.includes("BP0021-2001")) return empty;
      const x = Number(/xy\/([\d.]+)\//.exec(url)![1]);
      return x <= 85110 ? left : right;
    });
    const r = await provider.constraintsFor({ id: "T", areaM2: 1600, indicative: true, ring: [[85090, 446390], [85130, 446390], [85130, 446430], [85090, 446430]] });
    expect(seen.filter((u) => u.includes("BP0021-2001")).length).toBe(5);
    expect(r?.constraints.maxHeight.value).toBe(9);
    expect(r?.constraints.notes.some((n) => /lowest/.test(n.value ?? ""))).toBe(true);
    expect(r?.label).toMatch(/5 points/);
  });

  it("lists aanduidingen at the plot as notes", () => {
    const plan = municipalPlans(plans)[0]!;
    const c = constraintsFromPlan(plan, { gebiedsAanduidingen: [{ naam: "geluidzone - industrie" }], bouwAanduidingen: [{ naam: "specifieke bouwaanduiding - profiel-1" }], enkelBestemmingen: [{ naam: "Wonen" }] } as never, [0, 0]);
    const texts = c.notes.map((n) => n.value ?? "");
    expect(texts.some((t) => /Area designation.*geluidzone - industrie/.test(t))).toBe(true);
    expect(texts.some((t) => /Building designation.*profiel-1/.test(t))).toBe(true);
  });
});

describe("several bouwvlakken on one plot", () => {
  const plan = municipalPlans(plans)[0]!;
  const sq = (x: number, y: number, s: number) => `POLYGON ((${x} ${y}, ${x + s} ${y}, ${x + s} ${y + s}, ${x} ${y + s}, ${x} ${y}))`;
  const d = {
    bouwVlakken: [
      { id: 1, identificatie: "NL.A", geometrie: sq(0, 0, 10) },
      { id: 2, identificatie: "NL.B", geometrie: sq(20, 0, 30) },
    ],
    maatvoeringen: [
      { id: 3, aanduiding: "Bouwvlak=NL.A", maatvoering: '"maximum bouwhoogte (m)"="18"' },
      { id: 4, aanduiding: "Bouwvlak=NL.B", maatvoering: '"maximum bouwhoogte (m)"="3"' },
      { id: 5, aanduiding: "", maatvoering: '"maximum bebouwingspercentage (%)"="50"' },
    ],
  };

  it("uses the bouwvlak with most sample points and only its own maatvoering", () => {
    const c = constraintsFromPlan(plan, d as never, [5, 5], [], 3, [[5, 5], [2, 2], [30, 5]]);
    expect(c.maxHeight.value).toBe(18);
    expect(c.bouwvlak!.value!.coordinates[0]![1]![0]).toBe(10);
    expect(c.maxCoverage?.value).toBe(0.5);
    const texts = c.notes.map((n) => n.value ?? "");
    expect(texts.some((t) => /3 bouwvlakken|2 bouwvlakken/.test(t))).toBe(true);
    expect(texts.some((t) => /own maatvoering.*"maximum bouwhoogte \(m\)"="3"/.test(t))).toBe(true);
  });

  it("falls back to the larger bouwvlak when no sample point is inside one", () => {
    const c = constraintsFromPlan(plan, d as never, [100, 100], [], 1, [[100, 100]]);
    expect(c.maxHeight.value).toBe(3);
  });
});
