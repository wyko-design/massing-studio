import { describe, expect, it } from "vitest";
import { roofGeometry } from "./geometry";

/** Triangles of a geometry as [x, y, z] triples. */
function triangles(g: ReturnType<typeof roofGeometry>): [number, number, number][][] {
  const p = g.getAttribute("position");
  const out: [number, number, number][][] = [];
  for (let i = 0; i < p.count; i += 3) out.push([0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]));
  return out;
}

const area = (t: [number, number, number][]) => {
  const [a, b, c] = t as [[number, number, number], [number, number, number], [number, number, number]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  return Math.hypot(n[0]!, n[1]!, n[2]!) / 2;
};

describe("roofGeometry", () => {
  // 10 × 6 m box, ridge along x at y = 3, 2 m high, eaves at z = 9
  const g = roofGeometry([[[0, 0], [10, 0], [10, 6], [0, 6]]], 9, 0, 2);
  const tris = triangles(g);

  it("closes both gable ends with walls up to the ridge", () => {
    for (const x of [0, 10]) {
      const gable = tris.filter((t) => t.every((p) => Math.abs(p[0] - x) < 1e-9));
      expect(gable.reduce((s, t) => s + area(t), 0)).toBeCloseTo((6 * 2) / 2);
      expect(Math.max(...gable.flat().map((p) => p[2]))).toBeCloseTo(11);
    }
  });

  it("closes an L-shaped volume: every open edge lies on the eaves, where the walls below close it", () => {
    const l = roofGeometry([[[0, 0], [12, 0], [12, 5], [5, 5], [5, 12], [0, 12]]], 6, Math.PI / 4, 3);
    const key = (p: [number, number, number]) => p.map((x) => x.toFixed(4)).join(",");
    const uses = new Map<string, number>();
    for (const t of triangles(l)) {
      if (area(t) < 1e-9) continue;
      for (let k = 0; k < 3; k++) {
        const e = [key(t[k]!), key(t[(k + 1) % 3]!)].sort().join("|");
        uses.set(e, (uses.get(e) ?? 0) + 1);
      }
    }
    const open = [...uses].filter(([, n]) => n === 1).map(([e]) => e.split("|").map((p) => Number(p.split(",")[2])));
    expect(open.length).toBeGreaterThan(0);
    for (const zs of open) expect(zs).toEqual([6, 6]);
  });

  it("adds no wall along the eaves", () => {
    for (const y of [0, 6]) expect(tris.filter((t) => t.every((p) => Math.abs(p[1] - y) < 1e-9))).toHaveLength(0);
  });
});
