/**
 * Which way is the street? The bearing (degrees clockwise from north) from the parcel boundary to the nearest BGT carriageway
 * (PDOK BGT `wegdeel`, verified 2026-10-16 in geo/plotContext.ts). It feeds `streetSide`, which the envelope uses to tell street,
 * side and rear edges apart. On a corner plot the nearer street wins; the notes on the constraint say it is derived.
 */
import { centroid, type Parcel } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";
import { roadPolygonsRd } from "../../geo/plotContext";

type Pt = [number, number];

/** Roads farther than this from the plot do not say which side the street is on. */
export const MAX_STREET_DISTANCE_M = 40;
const SEARCH_RADIUS_M = MAX_STREET_DISTANCE_M + 30;

function nearestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Points along a closed ring, at most `step` metres apart (vertices included). */
export function boundaryPoints(ring: Pt[], step = 0.5): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.min(200, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Bearing (0–360, clockwise from north) of the vector from `from` to `to`. */
export const bearing = (from: Pt, to: Pt): number => ((Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI + 360) % 360;

/** The closest pair of points between a parcel ring and road polygons (RD metres), or null when there are no roads. */
export function nearestRoad(parcelRing: Pt[], roads: number[][][][]): { from: Pt; to: Pt; distanceM: number } | null {
  const samples = boundaryPoints(parcelRing);
  let best: { from: Pt; to: Pt; distanceM: number } | null = null;
  for (const poly of roads) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i] as Pt;
        const b = ring[i + 1] as Pt;
        for (const s of samples) {
          const q = nearestOnSegment(s, a, b);
          const d = Math.hypot(q[0] - s[0], q[1] - s[1]);
          if (!best || d < best.distanceM) best = { from: s, to: q, distanceM: d };
        }
      }
    }
  }
  return best;
}

export type StreetSide = { bearing: number; distanceM: number };

/** Above this a "parcel" is a whole block or estate with several streets: no single street side. */
export const MAX_PARCEL_AREA_M2 = 20_000;

export async function streetSideFor(fetchJson: JsonFetcher, parcel: Parcel): Promise<StreetSide | null> {
  if (parcel.areaM2 > MAX_PARCEL_AREA_M2) return null;
  const c = centroid(parcel.ring);
  const half = Math.max(...parcel.ring.map(([x, y]) => Math.max(Math.abs(x - c[0]), Math.abs(y - c[1]))));
  const roads = await roadPolygonsRd(fetchJson, Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10, Math.ceil(half) + SEARCH_RADIUS_M);
  const hit = nearestRoad(parcel.ring, roads);
  if (!hit || hit.distanceM > MAX_STREET_DISTANCE_M) return null;
  // a road that touches or overlaps the plot (distance 0) gives no direction: fall back to centroid → road
  const dir = hit.distanceM < 0.05 ? bearing(c, hit.to) : bearing(hit.from, hit.to);
  return { bearing: Math.round(dir) % 360, distanceM: Math.round(hit.distanceM * 10) / 10 };
}
