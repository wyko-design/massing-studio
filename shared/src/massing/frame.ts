import type { MultiPolygon, Pair } from "polygon-clipping";
import type { Envelope, SiteConstraints } from "../schemas/constraints";
import type { MassingParams } from "../schemas/massing";
import type { Ring } from "../schemas/site";
import { closeRing, openRing, rotate } from "../geo/planar";
import { edgeRoles, outwardBearing } from "../envelope/edges";
import { boxOf, type Box } from "./fit";

const DEG = Math.PI / 180;

/**
 * The building frame: the envelope rotated so the building axis runs along +u and the front
 * (street, or north for sun alignment) faces +v. local = rotate(frame, angle).
 */
export type Frame = {
  /** Radians; direction of the building axis (+u) in the local frame, from +x counter-clockwise. */
  angle: number;
  /** Envelope in the frame, ready for polygon-clipping. */
  env: MultiPolygon;
  box: Box;
};

/** Angle that turns +v towards a compass bearing (degrees clockwise from north). */
const angleFacing = (bearing: number) => -bearing * DEG;

/** Axis of the minimum-area bounding rectangle, oriented along its long side. */
function principalAngle(ring: Ring): number {
  let best = { area: Infinity, angle: 0 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const theta = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const r = rotate(ring, -theta);
    const xs = r.map((p) => p[0]);
    const ys = r.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w * h < best.area - 1e-9) best = { area: w * h, angle: w >= h ? theta : theta + Math.PI / 2 };
  }
  return best.angle;
}

/** Building axis angle for the alignment; explains any fallback in `assumptions`. */
export function axisAngle(outer: Ring, rules: SiteConstraints, alignment: MassingParams["alignment"], assumptions: string[]): number {
  if (alignment === "sun") return angleFacing(0); // axis east–west, long facades face north and south
  const street = rules.streetSide?.value ?? null;
  if (street === null) {
    assumptions.push("Street side unknown: the building is aligned to the long axis of the envelope.");
    return principalAngle(outer);
  }
  // follow the longest envelope edge that faces the street, so the front sits flush with it
  const roles = edgeRoles(outer, street);
  let best = { len: 0, bearing: street };
  for (let i = 0; i < outer.length; i++) {
    if (roles[i] !== "street") continue;
    const a = outer[i]!;
    const b = outer[(i + 1) % outer.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best.len) best = { len, bearing: outwardBearing(a, b) };
  }
  return angleFacing(best.bearing);
}

/** Rotate the envelope (CCW outer ring + holes, local frame) into the building frame. */
export function buildFrame(rings: Ring[], angle: number): Frame | null {
  const env: MultiPolygon = [rings.map((r) => closeRing(rotate(openRing(r), -angle)) as Pair[])];
  const box = boxOf(env);
  return box ? { angle, env, box } : null;
}

/** Frame geometry back to the local frame. */
export const toLocalFrame = (ring: Ring, frame: Frame): Ring => rotate(ring, frame.angle);
