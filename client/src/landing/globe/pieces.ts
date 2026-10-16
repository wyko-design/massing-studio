import type { LineString, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";
import type { View } from "./geo";

/**
 * Fast orthographic projection and line drawing for the world-atlas 50m borders.
 *
 * d3's projection stream costs ~360 ns per point plus ~30 µs per shape (80+ ms a frame here).
 * Instead every line keeps its points as unit vectors and a bounding cap (centre + angular radius),
 * both computed once. Per frame, lines outside the visible part of the sphere are skipped and a
 * point p is projected as (cx + s·e·p, cy − s·n·p), with e/n the east/north vectors at the view
 * centre: the same result as d3.geoOrthographic().rotate([−λ, −φ]). Lines are cut at the horizon;
 * the frame itself is clipped by the canvas.
 */

export type Vec = [number, number, number];
export type Cap = { c: Vec; r: number };
/**
 * Rings as packed unit vectors [x0, y0, z0, x1, …]. `closed`: draw the closing segment;
 * `loop`: the piece is a whole outline (an island, a lake), so it may be hidden when tiny.
 */
export type Piece = { rings: Float64Array[]; closed: boolean; loop: boolean; cap: Cap };

const RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;

export const toVec = (lon: number, lat: number): Vec => {
  const l = lon * RAD;
  const p = lat * RAD;
  const cp = Math.cos(p);
  return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)];
};

const angle = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

function pack(ring: Position[]): Float64Array {
  const out = new Float64Array(ring.length * 3);
  ring.forEach(([lon, lat], i) => out.set(toVec(lon!, lat!), i * 3));
  return out;
}

/** Cap holding all points: centre = normalised mean direction, radius = farthest point. */
export function capOf(points: Float64Array): Cap {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < points.length; i += 3) {
    x += points[i]!;
    y += points[i + 1]!;
    z += points[i + 2]!;
  }
  const len = Math.hypot(x, y, z);
  if (len < 1e-9) return { c: [1, 0, 0], r: Math.PI };
  const c: Vec = [x / len, y / len, z / len];
  let r = 0;
  for (let i = 0; i < points.length; i += 3) r = Math.max(r, angle(c, [points[i]!, points[i + 1]!, points[i + 2]!]));
  return { c, r };
}

/** Polygon outlines (each ring a closed line). */
export function polygonPieces(g: Polygon | MultiPolygon): Piece[] {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys
    .filter((p) => p[0]?.length)
    .map((coordinates) => {
      const rings = coordinates.map(pack);
      return { rings, closed: true, loop: true, cap: capOf(rings[0]!) };
    });
}

export function linePieces(g: MultiLineString | LineString): Piece[] {
  const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  return lines
    .filter((l) => l.length > 1)
    .map((coordinates) => {
      const ring = pack(coordinates);
      const [a, b] = [coordinates[0]!, coordinates[coordinates.length - 1]!];
      return { rings: [ring], closed: false, loop: a[0] === b[0] && a[1] === b[1], cap: capOf(ring) };
    });
}

/** Angular radius (rad) of the part of the sphere that can appear inside the view's frame. */
export function visibleAngle(view: View): number {
  const { clip, cx, cy, scale } = view;
  const dx = Math.max(Math.abs(clip.x - cx), Math.abs(clip.x + clip.w - cx));
  const dy = Math.max(Math.abs(clip.y - cy), Math.abs(clip.y + clip.h - cy));
  const d = Math.hypot(dx, dy);
  return d >= scale ? HALF_PI : Math.asin(d / scale);
}

/** View centre c and the east / north vectors e, n there; screen = (cx + s·e·p, cy − s·n·p). */
export type Basis = { cx: number; cy: number; s: number; c: Vec; e: Vec; n: Vec; visible: number };

export function basisFor(view: View): Basis {
  const l = view.centre[0] * RAD;
  const p = view.centre[1] * RAD;
  const [sl, cl, sp, cp] = [Math.sin(l), Math.cos(l), Math.sin(p), Math.cos(p)];
  return {
    cx: view.cx,
    cy: view.cy,
    s: view.scale,
    c: [cp * cl, cp * sl, sp],
    e: [-sl, cl, 0],
    n: [-sp * cl, -sp * sl, cp],
    visible: visibleAngle(view),
  };
}

type Ctx = CanvasRenderingContext2D;

/**
 * Chromium's path cost grows faster than linearly with the number of subpaths (one path with all
 * 1 400 land polygons: ~45 ms; batches of 16: ~4 ms), so shapes are painted in batches.
 */
export function batcher(ctx: Ctx, paint: () => void, size: number) {
  let k = 0;
  ctx.beginPath();
  return {
    next() {
      if (++k % size === 0) {
        paint();
        ctx.beginPath();
      }
    },
    end: () => paint(),
  };
}

/**
 * Strokes the pieces as lines cut at the horizon (closed pieces include their closing segment).
 * Loops smaller than `minLoopPx` across on screen (tiny islands and lakes) are left out.
 */
export function strokePieces(ctx: Ctx, pieces: Piece[], view: View, minLoopPx = 0, batchSize = 16) {
  const b = basisFor(view);
  const { cx, cy, s, c, e, n } = b;
  const batch = batcher(ctx, () => ctx.stroke(), batchSize);
  const to = (x: number, y: number, z: number, move: boolean) => {
    const sx = cx + s * (e[0] * x + e[1] * y + e[2] * z);
    const sy = cy - s * (n[0] * x + n[1] * y + n[2] * z);
    if (move) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  };
  for (const piece of pieces) {
    const theta = angle(c, piece.cap.c);
    if (theta - piece.cap.r > b.visible) continue;
    if (piece.loop && 2 * Math.sin(Math.min(piece.cap.r, HALF_PI)) * s < minLoopPx) continue;
    for (const r of piece.rings) {
      const count = r.length / 3;
      const steps = piece.closed ? count : count - 1;
      let ax = r[0]!;
      let ay = r[1]!;
      let az = r[2]!;
      let ad = c[0] * ax + c[1] * ay + c[2] * az;
      if (ad >= 0) to(ax, ay, az, true);
      for (let k = 1; k <= steps; k++) {
        const j = (k % count) * 3;
        const bx = r[j]!;
        const by = r[j + 1]!;
        const bz = r[j + 2]!;
        const bd = c[0] * bx + c[1] * by + c[2] * bz;
        if (ad >= 0 && bd >= 0) to(bx, by, bz, false);
        else if (ad >= 0 !== bd >= 0) {
          // horizon crossing: the point of the chord with c·p = 0, pushed out onto the sphere
          const t = ad / (ad - bd);
          const qx = ax + t * (bx - ax);
          const qy = ay + t * (by - ay);
          const qz = az + t * (bz - az);
          const len = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
          if (ad >= 0) to(qx / len, qy / len, qz / len, false);
          else {
            to(qx / len, qy / len, qz / len, true);
            to(bx, by, bz, false);
          }
        }
        ax = bx;
        ay = by;
        az = bz;
        ad = bd;
      }
    }
    batch.next();
  }
  batch.end();
}

const ANTIPODE_COS = Math.cos((Math.PI * 160) / 180);

/**
 * Fills the pieces with the current fillStyle, in batches. Back-side points are pinned radially
 * onto the limb, so the visible part of a polygon fills correctly. Pieces reaching within 20° of
 * the view's antipode are skipped (the pin direction is unstable there; only Antarctica).
 */
export function fillPieces(ctx: Ctx, pieces: Piece[], view: View, batchSize = 16, paint: () => void = () => ctx.fill()) {
  const b = basisFor(view);
  const { cx, cy, s, c, e, n } = b;
  const batch = batcher(ctx, paint, batchSize);
  for (const piece of pieces) {
    const theta = angle(c, piece.cap.c);
    if (theta - piece.cap.r > b.visible) continue;
    const allFront = theta + piece.cap.r < HALF_PI;
    let skip = false;
    if (!allFront && theta + piece.cap.r > Math.PI - 0.35) {
      outer: for (const r of piece.rings) {
        for (let i = 0; i < r.length; i += 3) {
          if (c[0] * r[i]! + c[1] * r[i + 1]! + c[2] * r[i + 2]! < ANTIPODE_COS) {
            skip = true;
            break outer;
          }
        }
      }
    }
    if (skip) continue;
    for (const r of piece.rings) {
      for (let i = 0; i < r.length; i += 3) {
        const x = r[i]!;
        const y = r[i + 1]!;
        const z = r[i + 2]!;
        let px = e[0] * x + e[1] * y + e[2] * z;
        let py = n[0] * x + n[1] * y + n[2] * z;
        if (!allFront && c[0] * x + c[1] * y + c[2] * z < 0) {
          const len = Math.sqrt(px * px + py * py) || 1;
          px /= len;
          py /= len;
        }
        if (i === 0) ctx.moveTo(cx + s * px, cy - s * py);
        else ctx.lineTo(cx + s * px, cy - s * py);
      }
      ctx.closePath();
    }
    batch.next();
  }
  batch.end();
}
