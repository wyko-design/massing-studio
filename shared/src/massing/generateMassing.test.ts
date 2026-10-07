import { describe, expect, it } from "vitest";
import polygonClipping, { type Pair } from "polygon-clipping";
import type { Envelope, SiteConstraints } from "../schemas/constraints";
import { MassingResultSchema, type MassingParams, type MassingResult, type Typology } from "../schemas/massing";
import type { Ring } from "../schemas/site";
import { polygonArea } from "../geo/planar";
import { unknownConstraints } from "../constraints/overrides";
import { generateMassing } from "./generateMassing";
import {
  envelopeOf,
  k2410Area,
  k2410Envelope,
  k2410Rules,
  lRing,
  num,
  params,
  rectRing,
  rotatedRect,
  rules,
  site,
  wobbly,
} from "./__fixtures__/sites";

const row = (r: MassingResult, rule: string) => r.compliance.find((c) => c.rule === rule)!;
const rect30x20 = rectRing(30, 20); // street (south) along the 30 m edge
const run = (p: Partial<MassingParams> = {}, c: SiteConstraints = rules(), ring: Ring = rect30x20) =>
  generateMassing(envelopeOf(ring), c, params(p), site(polygonArea(ring)));

describe("generateMassing: known rectangle", () => {
  const r = run();
  it("builds a 30 × 10 slab along the street", () => {
    expect(r.volumes).toHaveLength(1);
    const xs = r.volumes[0]!.footprint.coordinates[0]!.map((p) => p[0]);
    const ys = r.volumes[0]!.footprint.coordinates[0]!.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(30);
    expect(Math.min(...ys)).toBeCloseTo(0); // flush with the street (south) edge
    expect(Math.max(...ys)).toBeCloseTo(10);
  });
  it("computes the metrics", () => {
    expect(r.metrics.footprint).toBeCloseTo(300);
    expect(r.metrics.gfa).toBeCloseTo(1200);
    expect(r.metrics.far).toBeCloseTo(2);
    expect(r.metrics.coverage).toBeCloseTo(0.5);
    expect(r.metrics.height).toBeCloseTo(12.5);
    expect(r.metrics.floors).toBe(4);
    expect(r.metrics.estUnits).toBe(15);
    expect(r.metrics.facadeSunScore).toBeCloseTo(0.75);
  });
  it("passes the known rules and clamps nothing", () => {
    expect(r.clamps).toEqual([]);
    expect(row(r, "Max building height")).toMatchObject({ status: "pass", detail: "12.5 m ≤ 15 m (assumed)" });
    expect(row(r, "Allowed functions").status).toBe("pass");
    expect(row(r, "Inside buildable envelope").status).toBe("pass");
    expect(row(r, "Max coverage (0–1)").status).toBe("unknown");
  });
  it("matches the result schema", () => {
    expect(() => MassingResultSchema.parse(r)).not.toThrow();
  });
});

describe("generateMassing: clamps", () => {
  it("limits floors by max height", () => {
    const r = run({ floors: 7 });
    expect(r.metrics.floors).toBe(4);
    expect(r.clamps).toContain("Asked for 7 floors; max height 15 m (assumed) allows 4 (3.5 m + 3 × 3 m = 12.5 m).");
    expect(row(r, "Max building height").status).toBe("pass");
  });
  it("limits floors by max gutter height", () => {
    const r = run({ floors: 5 }, rules({ maxGutterHeight: num(10, "m") }));
    expect(r.metrics.floors).toBe(3);
    expect(r.clamps.join()).toContain("max gutter height 10 m (assumed) allows 3 (wall top 9.5 m)");
    expect(row(r, "Max gutter height").detail).toBe("9.5 m ≤ 10 m (assumed)");
  });
  it("limits floors by max FAR", () => {
    const r = run({ floors: 4 }, rules({ maxFAR: num(1.2) }));
    expect(r.metrics.floors).toBe(2);
    expect(r.metrics.far).toBeLessThanOrEqual(1.2);
    expect(r.clamps.join()).toContain("max FAR 1.20 (assumed) allows 2");
  });
  it("caps the coverage target at max coverage", () => {
    const r = run({ coverageTarget: 0.9, depth: 20 }, rules({ maxCoverage: num(0.6) }));
    expect(r.clamps).toContain("Coverage target 0.90 exceeds the max coverage 0.60 (assumed); clamped to 0.60.");
    expect(r.metrics.coverage).toBeLessThanOrEqual(0.6);
    expect(r.metrics.coverage).toBeGreaterThan(0.59);
    expect(row(r, "Max coverage (0–1)").status).toBe("pass");
  });
  it("reports a coverage shortfall", () => {
    const r = run({ coverageTarget: 0.8 }); // a 10 m slab covers 300 of 600 m²
    expect(r.metrics.coverage).toBeCloseTo(0.5);
    expect(r.clamps.join()).toContain("Coverage target 0.80 reached 0.50");
  });
  it("clamps the depth to the envelope", () => {
    const r = run({ depth: 25 });
    expect(r.clamps).toContain("Depth 25 m is more than the envelope's 20 m across the building axis; clamped to 20 m.");
  });
  it("falls back to a slab for typologies without a template", () => {
    for (const typology of ["tower_podium", "stepped"] as Typology[]) {
      const r = run({ typology });
      expect(r.volumes.length).toBeGreaterThan(0);
      expect(r.clamps[0]).toMatch(/is not implemented yet; built as a slab\.$/);
    }
  });
  it("builds nothing when the ground floor alone is too high", () => {
    const r = run({}, rules({ maxHeight: num(3, "m") }));
    expect(r.volumes).toEqual([]);
    expect(r.clamps.join()).toContain("is below a single floor");
  });
});

describe("generateMassing: pitched roof", () => {
  const r = run({ roof: "pitched" }, rules({ maxGutterHeight: num(9.5, "m") }));
  const ridge = 5 * Math.tan((40 * Math.PI) / 180);
  it("puts a ridge on top and counts it in the height", () => {
    expect(r.volumes[0]!.roof?.ridgeHeight).toBeCloseTo(ridge);
    expect(r.metrics.height).toBeCloseTo(9.5 + ridge);
  });
  it("leaves room for the roof under max height", () => {
    expect(r.metrics.floors).toBe(3);
    expect(r.clamps.join()).toContain("allows 3 (3.5 m + 2 × 3 m + 4.2 m roof = 13.7 m)");
    expect(row(r, "Max building height").status).toBe("pass");
    expect(row(r, "Max gutter height").status).toBe("pass");
  });
  it("lists the roof assumption", () => {
    expect(r.assumptions.join()).toContain("Pitched roof at 40°");
  });
});

describe("generateMassing: unknown rules", () => {
  it("never passes a null rule and does not limit floors by an unknown height", () => {
    const c = { ...unknownConstraints("no fixture"), streetSide: num(180, "°") };
    const r = generateMassing(envelopeOf(rect30x20, null), c, params({ floors: 12 }), site(600));
    expect(r.metrics.floors).toBe(12);
    expect(r.clamps).toEqual([]);
    expect(r.assumptions.join()).toContain("Max height unknown");
    for (const c of r.compliance) {
      if (c.rule !== "Inside buildable envelope") expect(c.status).toBe("unknown");
    }
  });
  it("treats absent optional rules as unknown", () => {
    const c = rules();
    delete c.maxCoverage;
    delete c.maxFAR;
    delete c.maxGutterHeight;
    delete c.parkingNorm;
    const r = run({}, c);
    for (const rule of ["Max coverage (0–1)", "Max FAR", "Max gutter height", "Parking norm"]) {
      expect(row(r, rule).status).toBe("unknown");
    }
  });
  it("aligns to the envelope's long axis when the street side is unknown", () => {
    const c = rules();
    delete c.streetSide;
    const r = run({}, c, rotatedRect);
    expect(r.assumptions.join()).toContain("Street side unknown");
    expect(r.volumes.length).toBeGreaterThan(0);
  });
  it("computes parking demand from the norm but never passes it", () => {
    const r = run({}, rules({ parkingNorm: num(0.5, "spaces/unit") }));
    expect(row(r, "Parking norm")).toMatchObject({ status: "unknown" });
    expect(row(r, "Parking norm").detail).toContain("Needs 8 spaces (15 units × 0.5/unit");
  });
  it("fails a bestemming without housing", () => {
    const r = run({}, rules({ allowedFunctions: { value: ["Bedrijf"], prov: { source: "t", status: "verified" } } }));
    expect(row(r, "Allowed functions").status).toBe("fail");
  });
});

describe("generateMassing: empty envelope", () => {
  it("returns no volumes and says why", () => {
    const empty: Envelope = { ...envelopeOf(rect30x20), footprint: { type: "Polygon", coordinates: [] } };
    const r = generateMassing(empty, rules(), params(), site(600));
    expect(r.volumes).toEqual([]);
    expect(r.metrics.gfa).toBe(0);
    expect(r.clamps).toEqual(["The envelope has no buildable area, so nothing is generated."]);
    // the programme is residential whether or not anything fits; every geometric rule is unknown
    expect(r.compliance.filter((c) => c.rule !== "Allowed functions").every((c) => c.status === "unknown")).toBe(true);
  });
});

describe("generateMassing: typologies", () => {
  it("builds an L on a large square", () => {
    const r = run({ typology: "l_block", coverageTarget: 0.6 }, rules(), rectRing(40, 40));
    // front wing 40 × 10 + side wing 10 × 30
    expect(r.metrics.footprint).toBeCloseTo(700);
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]!.footprint.coordinates[0]).toHaveLength(7); // 6 corners, closed
  });
  it("builds a courtyard with a court on a large square", () => {
    const r = run({ typology: "courtyard", depth: 8, coverageTarget: 0.6 }, rules(), rectRing(40, 40));
    expect(r.volumes[0]!.footprint.coordinates).toHaveLength(2);
    expect(r.metrics.coverage).toBeLessThanOrEqual(0.6);
    expect(r.metrics.coverage).toBeGreaterThan(0.59);
  });
  it("falls back to a slab when no court fits (stand-in K 2410)", () => {
    const r = generateMassing(k2410Envelope, k2410Rules, params({ typology: "courtyard" }), site(k2410Area));
    expect(r.clamps.join()).toContain("so it is built as a slab");
    expect(r.volumes.length).toBeGreaterThan(0);
  });
  it("says when an L reads as a slab (stand-in K 2410)", () => {
    const r = generateMassing(k2410Envelope, k2410Rules, params({ typology: "l_block", depth: 12 }), site(k2410Area));
    expect(r.clamps.join()).toContain("it reads as a slab");
  });
});

describe("generateMassing: stays inside the envelope", () => {
  const cases: [string, Envelope, SiteConstraints, number][] = [
    ["rectangle", envelopeOf(rect30x20), rules(), 600],
    ["L-shape", envelopeOf(lRing), rules(), polygonArea(lRing)],
    ["rotated rectangle", envelopeOf(rotatedRect), rules({ streetSide: num(155, "°") }), polygonArea(rotatedRect)],
    ["wobbly 40-gon", envelopeOf(wobbly), rules({ streetSide: num(200, "°") }), polygonArea(wobbly) * 1.3],
    ["K 2410", k2410Envelope, k2410Rules, k2410Area],
  ];
  for (const [name, env, c, parcelArea] of cases) {
    for (const typology of ["slab", "l_block", "courtyard"] as Typology[]) {
      for (const alignment of ["street", "sun"] as const) {
        it(`${name}, ${typology}, ${alignment}`, () => {
          for (const coverageTarget of [0.2, 0.45, 0.9]) {
            const r = generateMassing(env, c, params({ typology, alignment, coverageTarget, depth: 9 }), site(parcelArea));
            expect(r.volumes.length).toBeGreaterThan(0);
            expect(r.metrics.coverage).toBeGreaterThan(0.1);
            const parts = r.volumes.map((v) => v.footprint.coordinates as Pair[][]);
            const outside = parts.length ? polygonClipping.difference(parts, env.footprint.coordinates as Pair[][]) : [];
            const outsideArea = outside.reduce((s, p) => s + polygonArea(p[0]!), 0);
            expect(outsideArea).toBeLessThan(1e-6);
            expect(r.metrics.coverage).toBeLessThanOrEqual(coverageTarget + 1e-9);
            expect(r.metrics.coverage).toBeLessThanOrEqual((c.maxCoverage?.value ?? 1) + 1e-9);
            expect(row(r, "Inside buildable envelope").status).toBe("pass");
          }
        });
      }
    }
  }
});

describe("generateMassing: purity", () => {
  it("does not mutate its inputs and is deterministic", () => {
    const p = params({ typology: "courtyard", roof: "pitched" });
    const before = JSON.parse(JSON.stringify({ env: k2410Envelope, rules: k2410Rules, p }));
    const a = generateMassing(k2410Envelope, k2410Rules, p, site(k2410Area));
    const b = generateMassing(k2410Envelope, k2410Rules, p, site(k2410Area));
    expect({ env: k2410Envelope, rules: k2410Rules, p }).toEqual(before);
    expect(a).toEqual(b);
    expect(() => MassingResultSchema.parse(a)).not.toThrow();
  });
});
