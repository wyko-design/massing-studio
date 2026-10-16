import { geoArea } from "d3-geo";
import { describe, expect, it } from "vitest";
import { asMultiPolygon, circlePolygon, geometryBbox, insideTest, cleanPolygons } from "./cityGeo";

// RFC 7946: outer ring counter-clockwise, hole clockwise
const ring = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const square = { type: "Polygon" as const, coordinates: [ring(4, 52, 4.1, 52.1), ring(4.04, 52.04, 4.06, 52.06).reverse()] };

describe("insideTest", () => {
  const inside = insideTest(square);
  it("is true inside, false outside and inside the hole", () => {
    expect(inside(4.02, 52.02)).toBe(true);
    expect(inside(4.2, 52.02)).toBe(false);
    expect(inside(4.05, 52.05)).toBe(false); // the hole
  });
  it("handles a MultiPolygon", () => {
    const multi = { type: "MultiPolygon" as const, coordinates: [square.coordinates, [ring(10, 50, 10.1, 50.1)]] };
    const t = insideTest(multi);
    expect(t(10.05, 50.05)).toBe(true);
    expect(t(7, 51)).toBe(false);
  });
});

describe("asMultiPolygon", () => {
  it("winds the outer ring the way d3 wants it: the city is small, not the rest of the globe", () => {
    // d3 reads a counter-clockwise outer ring as the complement of the city: an area of nearly 4π
    expect(geoArea({ type: "Polygon", coordinates: square.coordinates })).toBeGreaterThan(10);
    expect(geoArea(asMultiPolygon(square))).toBeLessThan(1e-4);
  });
  it("keeps clockwise input as it is, and the point set", () => {
    const cw = { type: "Polygon" as const, coordinates: [ring(4, 52, 4.1, 52.1).reverse()] };
    const m = asMultiPolygon(cw);
    expect(geoArea(m)).toBeLessThan(1e-4);
    expect(m.coordinates[0]![0]).toHaveLength(5);
  });
});

describe("circlePolygon / geometryBbox", () => {
  it("makes a closed circle, sized by population and clamped to 2–25 km", () => {
    const small = circlePolygon(10, 50, 100);
    const big = circlePolygon(10, 50, 1e8);
    const w = (g: typeof small) => {
      const b = geometryBbox(g);
      return b.n - b.s;
    };
    expect(w(small)).toBeCloseTo((2 * 2) / 111.32, 3);
    expect(w(big)).toBeCloseTo((2 * 25) / 111.32, 3);
    const first = small.coordinates[0]![0]!;
    const last = small.coordinates[0]![64]!;
    expect(last[0]).toBeCloseTo(first[0]!, 9);
    expect(insideTest(small)(10, 50)).toBe(true);
  });
});

describe("cleanPolygons", () => {
  const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

  it("cuts off a zero-width spike and keeps the rest", () => {
    // a square with a spike: ... (1,0.5) → (1.5,0.5) → back to (1,0.5) ...
    const ring: [number, number][] = [[0, 0], [1, 0], [1, 0.5], [1.5, 0.5], [1, 0.5], [1, 1], [0, 1], [0, 0]];
    const out = cleanPolygons([[ring]], 0.001);
    expect(out).toHaveLength(1);
    expect(out[0]![0]!.some(([x]) => x === 1.5)).toBe(false);
  });

  it("drops polygons and holes smaller than a few pixels, and thin slivers", () => {
    const px = 0.01;
    const big = sq(0, 0, 10);
    const tinyHole = sq(2, 2, 0.02);
    const goodHole = sq(5, 5, 2);
    const sliver: [number, number][] = [[20, 0], [30, 0], [30, 0.005], [20, 0.005], [20, 0]];
    const out = cleanPolygons([[big, tinyHole, goodHole], [sliver], [sq(40, 0, 0.02)]], px);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(2); // outer ring + the good hole
  });
});
