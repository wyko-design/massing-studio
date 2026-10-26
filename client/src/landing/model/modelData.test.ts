import { describe, expect, it } from "vitest";
import type { PlotData } from "../globe/plotLayer";
import { localFrame, toLonLat } from "../globe/plotLayer";
import { blockedTest, buildModel, envelopeRings, mergeBlocks, sceneToModel, simplifyRing } from "./modelData";

const O: [number, number] = [4.37, 52.0];
const L = localFrame(O);
/** A ring in local metres → lon/lat. */
const ll = (ring: [number, number][]) => ring.map(([x, y]) => toLonLat(L, x, y));
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const plot: PlotData = {
  id: "adr-x",
  label: "Test",
  point: O,
  parcel: { id: "K 1", areaM2: 400, polygons: [[ll(rect(-10, -10, 10, 10))]] },
  frameM: 90,
  buildings: [
    { id: "near", ring: ll(rect(-5, -5, 5, 5)), height: 9 },
    { id: "edge", ring: ll(rect(40, -5, 80, 5)), height: 12 },
    { id: "out", ring: ll(rect(200, 200, 210, 210)), height: 3 },
    { id: "unknown", ring: ll(rect(-30, 20, -20, 30)) },
  ],
  ground: { road: [[ll(rect(-100, -20, 100, -14))]], water: [] },
};

describe("buildModel", () => {
  const m = buildModel(plot, 50, 0);

  it("centres on the parcel and cuts every layer to the square", () => {
    expect(m.centre[0]).toBeCloseTo(O[0], 9);
    expect(m.centre[1]).toBeCloseTo(O[1], 9);
    expect(m.buildings.map((b) => b.id)).toEqual(["near", "edge", "unknown"]);
    const edge = m.buildings.find((b) => b.id === "edge")!;
    expect(Math.max(...edge.polys[0]![0]!.map((p) => p[0]))).toBeCloseTo(50, 6);
    const roadXs = m.road[0]![0]!.map((p) => p[0]);
    expect(Math.min(...roadXs)).toBeCloseTo(-50, 6);
    expect(Math.max(...roadXs)).toBeCloseTo(50, 6);
  });

  it("orders the ripple from the plot outwards and keeps unknown heights unknown", () => {
    const near = m.buildings.find((b) => b.id === "near")!;
    const edge = m.buildings.find((b) => b.id === "edge")!;
    expect(near.order).toBeLessThan(0.01);
    expect(edge.order).toBeGreaterThan(near.order);
    expect(m.buildings.find((b) => b.id === "unknown")!.height).toBeNull();
  });

  it("gives open rings and the parcel's dot lattice", () => {
    const ring = m.parcel[0]![0]!;
    expect(ring).toHaveLength(4);
    // 1 m lattice inside a 20 × 20 m parcel
    expect(m.dots.coarse.length / 2).toBeGreaterThan(300);
    expect(m.dots.coarse.every((v) => Math.abs(v) <= 10)).toBe(true);
  });
});

describe("envelopeRings", () => {
  it("puts an RD-frame ring back where it is in the local frame", () => {
    const env = {
      footprint: { type: "Polygon" as const, coordinates: [rect(-5, -5, 5, 5)] },
      maxHeight: 12,
      source: "setbacks" as const,
      prov: { status: "assumed" as const, source: "test" },
      notes: [],
    };
    const ring = envelopeRings(env, { lon: O[0], lat: O[1] }, L)[0]!;
    expect(ring).toHaveLength(4);
    // RD north is about 0.8° off true north here: within 0.2 m over 10 m
    for (const [p, q] of ring.map((p, i) => [p, rect(-5, -5, 5, 5)[i]!] as const)) {
      expect(Math.abs(p[0] - q[0])).toBeLessThan(0.2);
      expect(Math.abs(p[1] - q[1])).toBeLessThan(0.2);
    }
  });
});

describe("sceneToModel", () => {
  it("maps scene points where envelopeRings puts them", () => {
    const ring = rect(-120, -80, 150, 90).slice(0, 4);
    const env = {
      footprint: { type: "Polygon" as const, coordinates: [rect(-120, -80, 150, 90)] },
      maxHeight: 12,
      source: "setbacks" as const,
      prov: { status: "assumed" as const, source: "test" },
      notes: [],
    };
    const exact = envelopeRings(env, { lon: O[0], lat: O[1] }, L)[0]!;
    const m = sceneToModel({ lon: O[0], lat: O[1] }, L);
    ring.forEach(([x, y], i) => {
      expect(Math.abs(m.a * x + m.b * y + m.e - exact[i]![0])).toBeLessThan(0.01);
      expect(Math.abs(m.c * x + m.d * y + m.f - exact[i]![1])).toBeLessThan(0.01);
    });
  });
});

describe("blockedTest", () => {
  it("is true inside any footprint and false in its holes and outside", () => {
    const blocked = blockedTest([[rect(0, 0, 10, 10).slice(0, 4), rect(4, 4, 6, 6).slice(0, 4)]]);
    expect(blocked(2, 2)).toBe(true);
    expect(blocked(5, 5)).toBe(false);
    expect(blocked(20, 2)).toBe(false);
  });
});

describe("simplifyRing", () => {
  it("drops jogs smaller than the tolerance and keeps real corners", () => {
    // a 10 × 10 square with a 0.2 m step halfway along the bottom
    const ring: [number, number][] = [[0, 0], [5, 0], [5, 0.2], [10, 0.2], [10, 10], [0, 10]];
    const out = simplifyRing(ring, 0.6);
    expect(out).toHaveLength(4);
    expect(simplifyRing(ring, 0.05)).toHaveLength(6);
  });
});

describe("mergeBlocks", () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][]];

  it("joins a terrace of touching houses of about the same height into one block (with a gap of a few cm)", () => {
    const out = mergeBlocks([
      { id: "a", polys: [sq(0, 0, 6, 10)], height: 9 },
      { id: "b", polys: [sq(6.05, 0, 12, 10)], height: 9.6 },
      { id: "c", polys: [sq(12, 0, 18, 10)], height: 10 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.polys).toHaveLength(1);
    expect(out[0]!.polys[0]![0]).toHaveLength(4); // one rectangle: no party-wall corners left
    expect(out[0]!.height).toBeCloseTo((9 * 60 + 9.6 * 59.5 + 10 * 60) / 179.5, 1);
  });

  it("keeps apart different heights, unknown heights, buildings that do not touch and the plot's own building", () => {
    const out = mergeBlocks([
      { id: "low", polys: [sq(0, 0, 6, 10)], height: 3 },
      { id: "high", polys: [sq(6, 0, 12, 10)], height: 12 },
      { id: "unknown", polys: [sq(12, 0, 18, 10)], height: null },
      { id: "far", polys: [sq(30, 0, 36, 10)], height: 12 },
      { id: "own", polys: [sq(-6, 0, 0, 10)], height: 3, own: true },
    ]);
    expect(out.map((b) => b.id).sort()).toEqual(["far", "high", "low", "own", "unknown"]);
  });
});
