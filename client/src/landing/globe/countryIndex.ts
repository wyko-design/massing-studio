import type { CountryShape } from "../countries";

/**
 * Point → country lookup for the dot lattice (planar ray cast in lon/lat on the 50m polygons).
 *
 * Edges are bucketed into thin latitude strips, so a lookup only visits the edges at its latitude.
 * Rings that cross the antimeridian (Russia, Fiji, Antarctica) are unwrapped to continuous
 * longitudes; a ring that circles a pole (Antarctica) is closed along that pole. A query is then
 * tested at lon − 360, lon and lon + 360.
 */

const STRIP_DEG = 0.1;
const STRIPS = Math.ceil(180 / STRIP_DEG);
const SHIFTS = [-360, 0, 360] as const;

export type CountryIndex = {
  /** Country keys (world-atlas ids), indexed by the numbers lookup() returns. */
  ids: string[];
  /** Index into `ids` of the country containing the point, or −1 for water. */
  lookup: (lon: number, lat: number) => number;
};

const wrap = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
const stripOf = (lat: number) => Math.min(STRIPS - 1, Math.max(0, Math.floor((lat + 90) / STRIP_DEG)));

export function buildCountryIndex(shapes: Iterable<CountryShape>): CountryIndex {
  const ids: string[] = [];
  // per strip: flat [x1, y1, x2, y2, country] tuples
  const strips: number[][] = Array.from({ length: STRIPS }, () => []);

  const addEdge = (x1: number, y1: number, x2: number, y2: number, country: number) => {
    if (y1 === y2) return; // horizontal edges never cross a horizontal ray
    const a = stripOf(Math.min(y1, y2));
    const b = stripOf(Math.max(y1, y2));
    for (let s = a; s <= b; s++) strips[s]!.push(x1, y1, x2, y2, country);
  };

  for (const shape of shapes) {
    const country = ids.push(shape.id) - 1;
    for (const polygon of shape.geometry.coordinates) {
      for (const ring of polygon) {
        if (ring.length < 3) continue;
        // continuous longitudes along the ring
        const xs = [ring[0]![0]!];
        for (let i = 1; i < ring.length; i++) xs.push(xs[i - 1]! + wrap(ring[i]![0]! - ring[i - 1]![0]!));
        const pts = ring.map((p, i) => [xs[i]!, p[1]!] as const);
        const net = xs[xs.length - 1]! - xs[0]!;
        if (Math.abs(net) > 180) {
          // circles a pole: close the ring along it
          const meanLat = ring.reduce((s, p) => s + p[1]!, 0) / ring.length;
          const pole = meanLat < 0 ? -90 : 90;
          pts.push([xs[xs.length - 1]!, pole], [xs[0]!, pole], [xs[0]!, ring[0]![1]!]);
        }
        for (let i = 1; i < pts.length; i++) addEdge(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], country);
      }
    }
  }

  const packed = strips.map((s) => Float64Array.from(s));
  // Crossing parity per (country, shift) for the current query. A country's polygons are disjoint
  // and its holes lie inside its outer rings, so an odd total over all its rings means "inside".
  const parity = new Uint8Array(ids.length * 3);
  const touched: number[] = [];

  const lookup = (lon: number, lat: number): number => {
    const edges = packed[stripOf(lat)]!;
    for (let e = 0; e < edges.length; e += 5) {
      const y1 = edges[e + 1]!;
      const y2 = edges[e + 3]!;
      if (y1 > lat === y2 > lat) continue;
      const x1 = edges[e]!;
      const xc = x1 + ((lat - y1) / (y2 - y1)) * (edges[e + 2]! - x1);
      const base = edges[e + 4]! * 3;
      for (let k = 0; k < 3; k++) {
        if (xc > lon + SHIFTS[k]!) {
          parity[base + k]! ^= 1;
          touched.push(base + k);
        }
      }
    }
    let found = -1;
    for (const slot of touched) {
      if (parity[slot]) found = Math.floor(slot / 3);
      parity[slot] = 0;
    }
    touched.length = 0;
    return found;
  };

  return { ids, lookup };
}
