/**
 * People for the site model: OpenStreetMap paths and the pavements beside streets become a graph in local metres, and
 * every walker follows it edge by edge, picking a random way on at each junction. Pure maths, no three.js.
 */
import type { XY } from "./modelData";

export type Line = XY[];

/** Street classes and their carriageway width, used to put people on the pavement beside them (m). */
export const CAR_WIDTH: Record<string, number> = {
  motorway: 11,
  trunk: 9,
  primary: 7.5,
  secondary: 7,
  tertiary: 6.5,
  unclassified: 5,
  residential: 5.5,
  living_street: 5,
};
/** Classes people walk on as they are. Living streets (woonerven) are shared space. */
export const WALK_CLASSES = new Set(["pedestrian", "footway", "path", "living_street"]);
/** Streets that get a pavement on each side, this far beyond the carriageway's edge (m). */
const PAVEMENT_CLASSES = new Set(["primary", "secondary", "tertiary", "unclassified", "residential"]);
const PAVEMENT_OFFSET = 1.5;

/** Part of a segment inside the square |x|, |y| ≤ half (Liang–Barsky), or null. */
function clipSegment(a: XY, b: XY, half: number): [XY, XY] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] + half],
    [dx, half - a[0]],
    [-dy, a[1] + half],
    [dy, half - a[1]],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

const same = (a: XY, b: XY) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** The pieces of a polyline inside the square. */
export function clipLine(line: Line, half: number): Line[] {
  const out: Line[] = [];
  let cur: Line = [];
  for (let i = 1; i < line.length; i++) {
    const seg = clipSegment(line[i - 1]!, line[i]!, half);
    if (!seg) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      continue;
    }
    if (cur.length && same(cur[cur.length - 1]!, seg[0])) cur.push(seg[1]);
    else {
      if (cur.length > 1) out.push(cur);
      cur = [seg[0], seg[1]];
    }
    // the segment left the square: the next piece starts a new line
    if (!same(seg[1], line[i]!)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Extra points so that no segment is longer than `step`. */
export function densify(line: Line, step: number): Line {
  const out: Line = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** The line moved `d` metres to its left (negative: right), each point along the mean of its segments' normals. */
export function offsetLine(line: Line, d: number): Line {
  const normal = (a: XY, b: XY): XY => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  return line.map((p, i) => {
    const n0 = i > 0 ? normal(line[i - 1]!, p) : null;
    const n1 = i < line.length - 1 ? normal(p, line[i + 1]!) : null;
    let nx = (n0?.[0] ?? 0) + (n1?.[0] ?? 0);
    let ny = (n0?.[1] ?? 0) + (n1?.[1] ?? 0);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // keep the pavement's width at corners (miter), but not without limit at sharp turns
    const cos = n0 && n1 ? Math.max(0.5, n0[0] * nx + n0[1] * ny) : 1;
    return [p[0] + (nx * d) / cos, p[1] + (ny * d) / cos];
  });
}

/** Breaks a line wherever a point falls inside a building or water. */
export function cutBlocked(line: Line, blocked: (x: number, y: number) => boolean): Line[] {
  const out: Line[] = [];
  let cur: Line = [];
  for (const p of line) {
    if (blocked(p[0], p[1])) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export type Graph = {
  pts: XY[];
  /** Neighbours of each point. */
  adj: number[][];
  /** Every edge once (a < b) with its length, and the running total for picking one by length. */
  edges: [number, number, number][];
  cum: number[];
  length: number;
};

/** Lines → graph. Points closer than `snap` metres are one node, so ways that share an OSM node join there. */
export function buildGraph(lines: Line[], snap = 0.25): Graph {
  const pts: XY[] = [];
  const adj: number[][] = [];
  const index = new Map<string, number>();
  const node = (p: XY) => {
    const key = `${Math.round(p[0] / snap)},${Math.round(p[1] / snap)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = pts.length;
      index.set(key, i);
      pts.push(p);
      adj.push([]);
    }
    return i;
  };
  const edges: [number, number, number][] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (let k = 1; k < line.length; k++) {
      const a = node(line[k - 1]!);
      const b = node(line[k]!);
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      adj[a]!.push(b);
      adj[b]!.push(a);
      edges.push([Math.min(a, b), Math.max(a, b), Math.hypot(pts[b]![0] - pts[a]![0], pts[b]![1] - pts[a]![1])]);
    }
  }
  const cum: number[] = [];
  let length = 0;
  for (const e of edges) cum.push((length += e[2]));
  return { pts, adj, edges, cum, length };
}

export type Mover = {
  /** On the edge from node `a` to node `b`, `s` metres along it (of `len`). */
  a: number;
  b: number;
  s: number;
  len: number;
  speed: number;
  /** Sideways offset from the line (m, + = right of travel): the lane, or a person's place on the pavement. */
  side: number;
  /** Seconds since it (re)appeared: it grows in over the first half second. */
  age: number;
};

type Rnd = () => number;

const dist = (g: Graph, a: number, b: number) => Math.hypot(g.pts[b]![0] - g.pts[a]![0], g.pts[b]![1] - g.pts[a]![1]);

/** A mover somewhere on the graph, every metre of line equally likely. Null for an empty graph. */
export function spawnMover(g: Graph, rnd: Rnd, speed: number, side: number): Mover | null {
  if (!g.edges.length) return null;
  const target = rnd() * g.length;
  let lo = 0;
  let hi = g.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.cum[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  const [x, y, len] = g.edges[lo]!;
  const [a, b] = rnd() < 0.5 ? [x, y] : [y, x];
  return { a, b, s: rnd() * len, len, speed, side, age: 0 };
}

/** Moves a mover `dt` seconds on. At a junction it takes a random other way; at a dead end inside the model it turns
 *  round, at the model's edge it disappears and comes back somewhere else. */
export function stepMover(g: Graph, m: Mover, dt: number, rnd: Rnd, half: number): void {
  m.age += dt;
  m.s += m.speed * dt;
  for (let guard = 0; m.s >= m.len && guard < 32; guard++) {
    const over = m.s - m.len;
    const at = m.b;
    const options = g.adj[at]!.filter((n) => n !== m.a);
    let next: number;
    if (options.length) next = options[Math.floor(rnd() * options.length)]!;
    else {
      const [x, y] = g.pts[at]!;
      if (Math.max(Math.abs(x), Math.abs(y)) > half - 1) {
        const fresh = spawnMover(g, rnd, m.speed, m.side);
        if (fresh) Object.assign(m, fresh);
        return;
      }
      next = m.a;
    }
    m.a = at;
    m.b = next;
    m.len = dist(g, at, next);
    m.s = over;
  }
}

/** Where a mover is: position (local metres) and heading (radians from +x, counter-clockwise). */
export function moverPose(g: Graph, m: Mover): { x: number; y: number; heading: number } {
  const [ax, ay] = g.pts[m.a]!;
  const [bx, by] = g.pts[m.b]!;
  const t = m.len > 0 ? Math.min(1, m.s / m.len) : 0;
  const dx = (bx - ax) / (m.len || 1);
  const dy = (by - ay) / (m.len || 1);
  // right of travel = (dy, −dx)
  return { x: ax + (bx - ax) * t + dy * m.side, y: ay + (by - ay) * t - dx * m.side, heading: Math.atan2(by - ay, bx - ax) };
}

export type StreetLine = { h: string; p: XY[] };

/**
 * Streets (local metres) → the walking graph inside the model square: the paths, and pavements beside the streets;
 * pavement points inside buildings or water are dropped.
 */
export function walkGraph(streets: StreetLine[], half: number, blocked: (x: number, y: number) => boolean): Graph {
  const inner = half - 0.5;
  const walk: Line[] = [];
  for (const s of streets) {
    const pieces = clipLine(s.p, inner);
    const width = CAR_WIDTH[s.h];
    if (WALK_CLASSES.has(s.h)) walk.push(...pieces.flatMap((l) => cutBlocked(densify(l, 2), blocked)));
    if (width !== undefined && PAVEMENT_CLASSES.has(s.h)) {
      for (const l of pieces) {
        const dense = densify(l, 2);
        for (const d of [width / 2 + PAVEMENT_OFFSET, -(width / 2 + PAVEMENT_OFFSET)]) {
          for (const side of clipLine(offsetLine(dense, d), inner)) walk.push(...cutBlocked(side, blocked));
        }
      }
    }
  }
  return buildGraph(walk);
}
