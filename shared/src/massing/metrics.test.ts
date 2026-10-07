import { describe, expect, it } from "vitest";
import type { Volume } from "../schemas/massing";
import { toGeoPolygon, rotate } from "../geo/planar";
import { computeMetrics, facadeSunScore, sunWeight } from "./metrics";
import { rectRing } from "./__fixtures__/sites";

const box = (ring: [number, number][], height: number, floors: number, holes: [number, number][][] = []): Volume => ({
  footprint: toGeoPolygon([ring, ...holes]),
  zBase: 0,
  height,
  floors,
});

describe("sun weight", () => {
  it("ranks S > SE/SW > E/W > N", () => {
    expect(sunWeight(180)).toBeCloseTo(1);
    expect(sunWeight(135)).toBeCloseTo(0.729, 3);
    expect(sunWeight(225)).toBeCloseTo(0.729, 3);
    expect(sunWeight(90)).toBeCloseTo(0.25);
    expect(sunWeight(270)).toBeCloseTo(0.25);
    expect(sunWeight(0)).toBeCloseTo(0);
  });
});

describe("facadeSunScore", () => {
  it("is 0.5 for any square, whatever its rotation", () => {
    expect(facadeSunScore([box(rectRing(10, 10), 6, 2)])).toBeCloseTo(0.5);
    expect(facadeSunScore([box(rotate(rectRing(10, 10), 0.4), 6, 2)])).toBeCloseTo(0.5);
  });
  it("prefers long facades facing south over east/west", () => {
    expect(facadeSunScore([box(rectRing(30, 10), 6, 2)])).toBeCloseTo(0.75); // 60 m S+N, 20 m E+W
    expect(facadeSunScore([box(rectRing(10, 30), 6, 2)])).toBeCloseTo(0.25);
  });
  it("spans 0–1 for very thin bars", () => {
    expect(facadeSunScore([box(rectRing(1000, 1), 3, 1)])).toBeGreaterThan(0.99);
    expect(facadeSunScore([box(rectRing(1, 1000), 3, 1)])).toBeLessThan(0.01);
  });
  it("counts court walls as facade", () => {
    // outer 30 × 10 bar (0.75) plus a 20 × 2 east–west court: more south/north wall
    const solid = facadeSunScore([box(rectRing(30, 10), 6, 2)]);
    const court = facadeSunScore([box(rectRing(30, 10), 6, 2, [[[5, 4], [25, 4], [25, 6], [5, 6]]])]);
    expect(court).toBeGreaterThan(solid);
  });
  it("is 0 without walls", () => {
    expect(facadeSunScore([])).toBe(0);
  });
});

describe("computeMetrics", () => {
  it("adds up a rectangle", () => {
    const m = computeMetrics([box(rectRing(30, 10), 12.5, 4)], 600, { targetUnits: 12, avgUnitSize: 60, netToGross: 0.75 });
    expect(m.footprint).toBeCloseTo(300);
    expect(m.gfa).toBeCloseTo(1200);
    expect(m.far).toBeCloseTo(2);
    expect(m.coverage).toBeCloseTo(0.5);
    expect(m.height).toBeCloseTo(12.5);
    expect(m.floors).toBe(4);
    expect(m.estUnits).toBe(15);
  });
  it("subtracts courts and counts the ridge in the height", () => {
    const v = box(rectRing(30, 30), 9.5, 3, [[[10, 10], [20, 10], [20, 20], [10, 20]]]);
    const m = computeMetrics([{ ...v, roof: { pitchDeg: 40, ridgeAngle: 0, ridgeHeight: 4 } }], 1000, { targetUnits: 1, avgUnitSize: 80, netToGross: 0.8 });
    expect(m.footprint).toBeCloseTo(800);
    expect(m.gfa).toBeCloseTo(2400);
    expect(m.height).toBeCloseTo(13.5);
    expect(m.estUnits).toBe(24);
  });
});
