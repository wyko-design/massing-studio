import { describe, expect, it } from "vitest";
import { buildGraph, clipLine, cutBlocked, densify, moverPose, offsetLine, spawnMover, stepMover, walkGraph, type Line } from "./movers";

/** Deterministic random numbers. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};

describe("clipLine", () => {
  it("keeps the part inside the square and splits a line that leaves and comes back", () => {
    expect(clipLine([[-20, 0], [20, 0]], 10)).toEqual([[[-10, 0], [10, 0]]]);
    const pieces = clipLine([[0, 0], [0, 20], [5, 20], [5, 0]], 10);
    expect(pieces).toEqual([
      [[0, 0], [0, 10]],
      [[5, 10], [5, 0]],
    ]);
    expect(clipLine([[20, 20], [30, 30]], 10)).toEqual([]);
  });
});

describe("densify / offsetLine / cutBlocked", () => {
  it("adds points every step, offsets to the left, breaks at blocked points", () => {
    const l = densify([[0, 0], [10, 0]], 2);
    expect(l).toHaveLength(6);
    expect(offsetLine(l, 3).every(([, y]) => Math.abs(y - 3) < 1e-9)).toBe(true);
    expect(offsetLine(l, -3).every(([, y]) => Math.abs(y + 3) < 1e-9)).toBe(true);
    const cut = cutBlocked(l, (x) => x > 3 && x < 7);
    expect(cut.map((c) => c.length)).toEqual([2, 2]);
  });
});

describe("buildGraph", () => {
  it("joins ways at shared points and counts every edge once", () => {
    const a: Line = [[0, 0], [10, 0], [20, 0]];
    const b: Line = [[10, 0], [10, 10]];
    const g = buildGraph([a, b, [[0, 0], [10, 0]]]);
    expect(g.pts).toHaveLength(4);
    expect(g.edges).toHaveLength(3);
    expect(g.length).toBeCloseTo(30);
    const junction = g.pts.findIndex(([x, y]) => x === 10 && y === 0);
    expect(g.adj[junction]).toHaveLength(3);
  });
});

describe("movers", () => {
  const g = buildGraph([[[0, 0], [10, 0], [20, 0]], [[10, 0], [10, 10]]]);

  it("spawn on an edge, by length", () => {
    const m = spawnMover(g, seq(0.99, 0.1, 0.5), 1, 0)!;
    expect(m.len).toBeCloseTo(10);
    expect(m.s).toBeCloseTo(5);
    expect(spawnMover(buildGraph([]), Math.random, 1, 0)).toBeNull();
  });

  it("walk on through a junction and turn round at an inner dead end", () => {
    const start = g.pts.findIndex(([x]) => x === 0);
    const mid = g.pts.findIndex(([x, y]) => x === 10 && y === 0);
    const m = { a: start, b: mid, s: 0, len: 10, speed: 2, side: 0, age: 0 };
    stepMover(g, m, 6, seq(0), 100); // 12 m: 2 m past the junction
    expect(m.a).toBe(mid);
    expect(m.s).toBeCloseTo(2);
    const p = moverPose(g, m);
    expect(Math.hypot(p.x - 10, p.y) ).toBeCloseTo(2);
    // to the end of that branch (8 m) and 1 m back
    stepMover(g, m, 4.5, seq(0), 100);
    expect(m.b).toBe(mid);
    expect(m.s).toBeCloseTo(1);
    expect(m.age).toBeCloseTo(10.5);
  });

  it("reappear elsewhere at a dead end on the model's edge", () => {
    const end = g.pts.findIndex(([x]) => x === 20);
    const mid = g.pts.findIndex(([x, y]) => x === 10 && y === 0);
    const m = { a: mid, b: end, s: 9, len: 10, speed: 1, side: 0, age: 5 };
    stepMover(g, m, 2, seq(0.1, 0.9, 0.5), 20);
    expect(m.age).toBe(0);
  });

  it("pose: the side offset is to the right of travel", () => {
    const g2 = buildGraph([[[0, 0], [10, 0]]]);
    const p = moverPose(g2, { a: 0, b: 1, s: 5, len: 10, speed: 1, side: 1.5, age: 0 });
    expect([p.x, p.y]).toEqual([5, -1.5]);
    expect(p.heading).toBe(0);
  });
});

describe("walkGraph", () => {
  it("people on paths and on pavements beside streets, never inside buildings", () => {
    const streets = [
      { h: "residential", p: [[-50, 0], [50, 0]] as Line },
      { h: "footway", p: [[0, -50], [0, 50]] as Line },
      { h: "cycleway", p: [[-50, 20], [50, 20]] as Line },
    ];
    const blocked = (x: number, y: number) => x > 10 && x < 20 && y > 0 && y < 10;
    const walk = walkGraph(streets, 40, blocked);
    // the carriageway itself is nobody's path (only the footway crosses it, at x = 0)
    expect(walk.pts.some(([x, y]) => Math.abs(y) < 1e-9 && Math.abs(x) > 1e-9)).toBe(false);
    // two pavements 4.25 m off the street, cut around the building on the north side
    expect(walk.pts.some(([, y]) => Math.abs(y - 4.25) < 1e-6)).toBe(true);
    expect(walk.pts.some(([, y]) => Math.abs(y + 4.25) < 1e-6)).toBe(true);
    expect(walk.pts.some(([x, y]) => blocked(x, y))).toBe(false);
    // the cycleway is nobody's
    expect(walk.pts.some(([, y]) => y === 20)).toBe(false);
  });
});
