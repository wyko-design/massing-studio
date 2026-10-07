import type { Ring } from "../schemas/site";

export type EdgeRole = "street" | "side" | "rear";

/** Bearing in degrees clockwise from north of the outward normal of edge a→b on a CCW ring. */
export function outwardBearing(a: [number, number], b: [number, number]): number {
  const [nx, ny] = [b[1] - a[1], -(b[0] - a[0])]; // right-hand normal = outside of a CCW ring
  return (((Math.atan2(nx, ny) * 180) / Math.PI) % 360 + 360) % 360;
}

/** Smallest angle between two bearings, 0–180. */
export function bearingDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Does the ray from `p` along unit `dir` cross any edge of the ring other than `skip`? */
function rayHitsRing(p: [number, number], dir: [number, number], ring: Ring, skip: number): boolean {
  for (let j = 0; j < ring.length; j++) {
    if (j === skip) continue;
    const a = ring[j]!;
    const b = ring[(j + 1) % ring.length]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const denom = dir[0] * ey - dir[1] * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / denom; // along the ray
    const u = ((a[0] - p[0]) * dir[1] - (a[1] - p[1]) * dir[0]) / denom; // along the edge
    if (t > 1e-9 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/** Street and rear edges must lie within this share of the plot depth from its front or back. */
const END_ZONE = 0.25;

/**
 * Role of each edge i (ring[i] → ring[i+1]) of a CCW ring, from the bearing towards the street:
 * facing within 45° of the street → street, within 45° of the opposite → rear, otherwise side.
 * A street/rear candidate must also
 * - be exposed: the ray from its midpoint outward must not run back through the parcel (a jog
 *   inside a side boundary faces front or back too), and
 * - lie in the front or back quarter of the plot depth measured along the street bearing (the
 *   back face of a bump halfway along a side boundary is not the rear boundary).
 * Otherwise a rear setback measured from such an edge would cut the plot in half.
 */
export function edgeRoles(ring: Ring, streetBearing: number): EdgeRole[] {
  const rad = (streetBearing * Math.PI) / 180;
  const depthOf = (p: [number, number]) => p[0] * Math.sin(rad) + p[1] * Math.cos(rad);
  const depths = ring.map(depthOf);
  const [front, back] = [Math.max(...depths), Math.min(...depths)];
  const zone = END_ZONE * (front - back);
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const diff = bearingDiff(outwardBearing(a, b), streetBearing);
    if (diff > 45 && diff < 135) return "side";
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inZone = diff <= 45 ? depthOf(mid) >= front - zone : depthOf(mid) <= back + zone;
    if (!inZone) return "side";
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const out: [number, number] = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    if (rayHitsRing(mid, out, ring, i)) return "side";
    return diff <= 45 ? "street" : "rear";
  });
}
