import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";
import type { Ring } from "../schemas/site";
import { closeRing } from "../geo/planar";

/** Segments of the circle polygons at edge ends. */
const CIRCLE_STEPS = 32;
/** Circumscribe instead of inscribe, so the cut never stays closer than `d` between vertices. */
const CIRCUMSCRIBE = 1 / Math.cos(Math.PI / CIRCLE_STEPS);

function circle(c: Pair, r: number): Pair[] {
  const pts: Pair[] = [];
  for (let k = 0; k < CIRCLE_STEPS; k++) {
    const a = (2 * Math.PI * k) / CIRCLE_STEPS;
    pts.push([c[0] + Math.cos(a) * r * CIRCUMSCRIBE, c[1] + Math.sin(a) * r * CIRCUMSCRIBE]);
  }
  return closeRing(pts) as Pair[];
}

/**
 * Shrink a ring by a different distance per edge (distances[i] for ring[i] → ring[i+1]): keep the
 * points at least distances[i] from every edge i. That is the parcel minus, per edge, everything
 * within d of the segment: a band d wide on both sides plus a disk at each end. The disks handle
 * concave corners and parts of the plot that reach past the end of an edge. Planar metres.
 */
export function insetPerEdge(ring: Ring, distances: number[]): MultiPolygon {
  const n = ring.length;
  const cuts: Pair[][][] = [];
  for (let i = 0; i < n; i++) {
    const d = distances[i] ?? 0;
    if (d <= 0) continue;
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) {
      const nx = (-(b[1] - a[1]) / len) * d;
      const ny = ((b[0] - a[0]) / len) * d;
      cuts.push([
        [
          [a[0] - nx, a[1] - ny],
          [b[0] - nx, b[1] - ny],
          [b[0] + nx, b[1] + ny],
          [a[0] + nx, a[1] + ny],
          [a[0] - nx, a[1] - ny],
        ],
      ]);
    }
    cuts.push([circle(a, d)], [circle(b, d)]);
  }
  const subject: Pair[][] = [closeRing(ring)];
  return cuts.length ? polygonClipping.difference(subject, ...cuts) : [subject];
}
