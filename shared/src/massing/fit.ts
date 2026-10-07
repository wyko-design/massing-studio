import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";
import { polygonWithHolesArea } from "../geo/planar";

/** Axis-aligned box in the building frame (u along the building axis, +v towards the front). */
export type Box = { u0: number; u1: number; v0: number; v1: number };

/** Below this a rectangle side is float noise: polygon-clipping is never handed a degenerate shape. */
const EPS = 1e-9;

export const mpArea = (mp: MultiPolygon): number => mp.reduce((s, p) => s + polygonWithHolesArea(p), 0);

/** A closed CCW rectangle polygon, or null when it has no area. */
export function rect(u0: number, v0: number, u1: number, v1: number): Pair[][] | null {
  if (u1 - u0 <= EPS || v1 - v0 <= EPS) return null;
  return [[[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]]];
}

/** The part of `env` inside the rectangle. */
export function clipRect(env: MultiPolygon, u0: number, v0: number, u1: number, v1: number): MultiPolygon {
  const r = rect(u0, v0, u1, v1);
  return r ? polygonClipping.intersection(env, r) : [];
}

export function boxOf(mp: MultiPolygon): Box | null {
  let box: Box | null = null;
  for (const poly of mp) {
    for (const [u, v] of poly[0] ?? []) {
      if (!box) box = { u0: u, u1: u, v0: v, v1: v };
      else {
        box.u0 = Math.min(box.u0, u);
        box.u1 = Math.max(box.u1, u);
        box.v0 = Math.min(box.v0, v);
        box.v1 = Math.max(box.v1, v);
      }
    }
  }
  return box;
}

const MAX_ITER = 16;
/** Stop once the footprint is within this share of the target. */
const TOLERANCE = 0.005;

/**
 * Largest extent s ∈ [0, 1] whose shape stays at or below `target` m², by bisection. The invariant
 * area(lo) ≤ target (area(0) = 0) holds even where the area is not monotone in s, so the result
 * never exceeds the target. `shapeAt` returns null when the shape could not be computed.
 */
export function solveExtent(shapeAt: (s: number) => MultiPolygon | null, target: number): { s: number; shape: MultiPolygon; area: number } {
  if (target <= 0) return { s: 0, shape: [], area: 0 };
  const fits = (area: number) => area <= target * (1 + 1e-9); // float noise on an exact fit
  const full = shapeAt(1);
  const fullArea = full ? mpArea(full) : Infinity;
  if (full && fits(fullArea)) return { s: 1, shape: full, area: fullArea };
  let lo = { s: 0, shape: [] as MultiPolygon, area: 0 };
  let hi = 1;
  for (let i = 0; i < MAX_ITER && target - lo.area > TOLERANCE * target; i++) {
    const s = (lo.s + hi) / 2;
    const shape = shapeAt(s);
    const area = shape ? mpArea(shape) : Infinity; // a failed clip counts as "does not fit"
    if (shape && fits(area)) lo = { s, shape, area };
    else hi = s;
  }
  return lo;
}
