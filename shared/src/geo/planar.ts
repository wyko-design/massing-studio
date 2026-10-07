import type { Ring } from "../schemas/site";

/** Signed area (shoelace). Positive for counter-clockwise rings. */
export function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export const polygonArea = (ring: Ring): number => Math.abs(signedArea(ring));

export function centroid(ring: Ring): [number, number] {
  const a = signedArea(ring);
  if (a === 0) throw new Error("centroid of a degenerate polygon");
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Ray-casting point-in-polygon for an open ring. Boundary points count as inside only by chance. */
export function pointInRing(point: [number, number], ring: Ring): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shift a ring by -origin, turning RD metres into the local frame. */
export function toLocal(ring: Ring, origin: [number, number]): Ring {
  return ring.map(([x, y]) => [x - origin[0], y - origin[1]] as [number, number]);
}

/** Drop the closing duplicate vertex of a GeoJSON ring. */
export function openRing(ring: Ring): Ring {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1];
  return closed ? ring.slice(0, -1) : ring;
}

/** Repeat the first vertex at the end, as GeoJSON wants. */
export function closeRing(ring: Ring): Ring {
  const open = openRing(ring);
  return open.length ? [...open, open[0]!] : open;
}

/** The same ring, counter-clockwise. */
export const toCcw = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring);

/** Area of a GeoJSON polygon (outer ring minus holes). */
export const polygonWithHolesArea = (rings: Ring[]): number =>
  rings.reduce((sum, r, i) => sum + (i === 0 ? 1 : -1) * polygonArea(openRing(r)), 0);

/** Shortest distance from a point to the segment a–b. */
export function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Open ring without repeated, collinear or spike vertices (zero-width slivers that boolean
 * clipping leaves where two boundaries coincide). `tol` is the allowed offset in metres.
 */
export function cleanRing(ring: Ring, tol = 1e-6): Ring {
  let pts = openRing(ring);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length]!;
      const next = pts[(i + 1) % pts.length]!;
      const p = pts[i]!;
      // distance of p from the line prev–next (or from prev when they coincide)
      const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]);
      const off =
        len < tol
          ? Math.hypot(p[0] - prev[0], p[1] - prev[1])
          : Math.abs((next[0] - prev[0]) * (p[1] - prev[1]) - (next[1] - prev[1]) * (p[0] - prev[0])) / len;
      if (off < tol) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        i--;
      }
    }
  }
  return pts;
}

/** Rotate a ring about the origin by `angle` radians (counter-clockwise). */
export function rotate(ring: Ring, angle: number): Ring {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return ring.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]);
}

/** GeoJSON polygon from rings (outer first): cleaned, closed, CCW outer ring and CW holes. */
export function toGeoPolygon(rings: Ring[]): { type: "Polygon"; coordinates: Ring[] } {
  return {
    type: "Polygon",
    coordinates: rings.map((r, i) => {
      const ccw = toCcw(cleanRing(r));
      return closeRing(i === 0 ? ccw : [...ccw].reverse());
    }),
  };
}

/** How far a point lies outside a polygon (outer ring + holes, open or closed); 0 inside. */
export function distanceOutside(p: [number, number], rings: Ring[]): number {
  const open = rings.map(openRing);
  const inside = open.length > 0 && pointInRing(p, open[0]!) && !open.slice(1).some((h) => pointInRing(p, h));
  if (inside) return 0;
  let d = Infinity;
  for (const r of open) {
    for (let i = 0; i < r.length; i++) d = Math.min(d, distanceToSegment(p, r[i]!, r[(i + 1) % r.length]!));
  }
  return d;
}
