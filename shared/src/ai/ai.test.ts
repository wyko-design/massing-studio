import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITIES, PrioritiesSchema } from "../schemas/ai";
import type { MassingMetrics, MassingParams } from "../schemas/massing";
import type { Envelope } from "../schemas/constraints";
import { unknownConstraints } from "../constraints";
import { envelopeFacts } from "../massing/envelopeFacts";
import { clampToRanges, fitProgramme, PARAM_RANGES } from "./ranges";
import { digitErrors, hasDigits, isVerbatim, numbersIn, quoteStatesValue } from "./validate";
import { contrastIssues, realisedIssues } from "./contrast";

const params: MassingParams = {
  typology: "slab",
  floors: 4,
  groundFloorHeight: 3.5,
  floorHeight: 3,
  depth: 10,
  alignment: "street",
  coverageTarget: 0.5,
  roof: "flat",
  colour: "#c23350",
};

describe("clampToRanges", () => {
  it("leaves in-range params alone", () => {
    expect(clampToRanges(params)).toEqual({ params, clamps: [] });
  });

  it("clamps and records out-of-range values", () => {
    const { params: p, clamps } = clampToRanges({ ...params, depth: 45, floors: 15, coverageTarget: 0.05 });
    expect(p.depth).toBe(PARAM_RANGES.depth.max);
    expect(p.floors).toBe(12);
    expect(p.coverageTarget).toBe(0.1);
    expect(clamps).toEqual([
      "AI asked for floors 15; the input range allows 12.",
      "AI asked for depth 45 m; the input range allows 40 m.",
      "AI asked for coverage 0.05; the input minimum is 0.1.",
    ]);
  });

  it("snaps to the slider step without a clamp", () => {
    const { params: p, clamps } = clampToRanges({ ...params, depth: 10.3, floorHeight: 3.04 });
    expect(p.depth).toBe(10.5);
    expect(p.floorHeight).toBe(3);
    expect(clamps).toEqual([]);
  });

  it("clamps programme values", () => {
    expect(fitProgramme("targetUnits", 40)).toEqual({ value: 25, clamp: "Brief asked for target units 40; the input range allows 25." });
    expect(fitProgramme("avgUnitSize", 47)).toEqual({ value: 45, clamp: null });
  });
});

describe("text checks", () => {
  it("finds digits in prose", () => {
    expect(hasDigits("a low slab")).toBe(false);
    expect(hasDigits("four floors, 12 m")).toBe(true);
    expect(digitErrors([{ where: "intent", text: "about 20 homes" }, { where: "name", text: "Garden bar" }])).toHaveLength(1);
  });

  it("matches quotes verbatim, ignoring case, whitespace and typographic quotes", () => {
    const src = "De voor ‘Wonen’ aangewezen\n gronden  zijn bestemd voor wonen.";
    expect(isVerbatim("de voor 'wonen' aangewezen gronden", src)).toBe(true);
    expect(isVerbatim("gronden zijn bestemd voor kantoren", src)).toBe(false);
    expect(isVerbatim("  ", src)).toBe(false);
  });

  it("reads Dutch and English numbers and percentages", () => {
    expect(numbersIn("ten hoogste 10,5 m en 2.5 m")).toEqual([10.5, 2.5]);
    expect(quoteStatesValue("bedraagt ten hoogste 60%", 0.6)).toBe(true);
    expect(quoteStatesValue("ten hoogste 10,5 m", 10.5)).toBe(true);
    expect(quoteStatesValue("ten hoogste 13 m", 15)).toBe(false);
  });
});

describe("contrast", () => {
  const opt = (id: string, p: Partial<MassingParams>) => ({ id, value: { ...params, ...p } });

  it("flags near-identical options", () => {
    const issues = contrastIssues([opt("A", {}), opt("B", { floors: 5, depth: 11 }), opt("C", { typology: "courtyard" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^Options A and B are near-identical/);
  });

  it("accepts options that differ in typology, alignment or size", () => {
    expect(contrastIssues([opt("A", {}), opt("B", { alignment: "sun" }), opt("C", { floors: 7 })])).toEqual([]);
  });

  it("flags options that realise as the same building", () => {
    const m: MassingMetrics = { footprint: 55, gfa: 220, far: 2, coverage: 0.5, height: 12.5, floors: 4, estUnits: 2, facadeSunScore: 0.5 };
    const issues = realisedIssues([
      { id: "A", value: m },
      { id: "B", value: { ...m, footprint: 56, gfa: 222 } },
      { id: "C", value: { ...m, footprint: 30, gfa: 60, height: 6.5 } },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Options A and B");
  });
});

describe("priorities and envelope facts", () => {
  it("accepts integer weights 0–5 only", () => {
    expect(PrioritiesSchema.safeParse(DEFAULT_PRIORITIES).success).toBe(true);
    expect(PrioritiesSchema.safeParse({ ...DEFAULT_PRIORITIES, units: 6 }).success).toBe(false);
    expect(PrioritiesSchema.safeParse({ ...DEFAULT_PRIORITIES, units: 2.5 }).success).toBe(false);
  });

  it("computes envelope facts for a 20 × 10 m rectangle", () => {
    const rules = unknownConstraints("test");
    rules.maxCoverage = { value: 0.5, prov: { source: "t", status: "verified" } };
    const env: Envelope = {
      footprint: { type: "Polygon", coordinates: [[[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]] },
      maxHeight: 13,
      source: "parcel",
      prov: { source: "t", status: "assumed" },
      notes: [],
    };
    const f = envelopeFacts(env, rules, 400, { targetUnits: 10, avgUnitSize: 60, netToGross: 0.75 });
    expect(f.area).toBeCloseTo(200);
    expect(f.floorsAllowed).toBe(4); // 3.5 + 3 × 3 = 12.5 ≤ 13
    expect(f.maxFootprintByCoverage).toBe(200);
    expect(f.programmeGfa).toBe(800);
    expect(f.sun).toEqual({ length: expect.closeTo(20), depth: expect.closeTo(10) });
    expect(f.street).toEqual({ length: expect.closeTo(20), depth: expect.closeTo(10) });
  });

  it("reports unknown height and an empty envelope", () => {
    const env: Envelope = { footprint: { type: "Polygon", coordinates: [] }, maxHeight: null, source: "setbacks", prov: { source: "t", status: "assumed" }, notes: ["nothing fits"] };
    const f = envelopeFacts(env, unknownConstraints("t"), 100, { targetUnits: 5, avgUnitSize: 60, netToGross: 0.75 });
    expect(f).toMatchObject({ area: 0, floorsAllowed: null, maxFootprintByCoverage: null, street: null, sun: null, notes: ["nothing fits"] });
  });
});
