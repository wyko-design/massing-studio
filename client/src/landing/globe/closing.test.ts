import { describe, expect, it } from "vitest";
import { closePolygons } from "./closing";

const inside = (polys: number[][][][], x: number, y: number) =>
  polys.some((poly) => {
    let c = false;
    for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) c = !c;
    }
    return c;
  });

describe("closePolygons", () => {
  // a square with a narrow inlet cut in from the right (0.2 wide) and a wide bay from the left (2 wide)
  const shape = [[[0, 0], [10, 0], [10, 4.9], [6, 4.9], [6, 5.1], [10, 5.1], [10, 10], [0, 10], [0, 7], [4, 7], [4, 5], [4, 5], [4, 3], [0, 3], [0, 0]]];
  it("fills a narrow inlet, keeps a wide bay and the original area", () => {
    const out = closePolygons([shape] as never, 0.5) as number[][][][];
    expect(inside(out, 8, 5)).toBe(true);
    expect(inside(out, 2, 5)).toBe(false);
    expect(inside(out, 5, 1)).toBe(true);
  });
});
