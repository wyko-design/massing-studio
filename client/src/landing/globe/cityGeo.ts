import type { Geometry, MultiPolygon, Polygon, Position } from "geojson";
import type { Bbox } from "../geoApi";

const RAD = Math.PI / 180;

/** Planar ray cast in lon/lat, fine for a city. */
function inRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function polygons(g: Geometry): Position[][][] {
  return g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
}

/** Bounding box of a polygon geometry. */
export function geometryBbox(g: Geometry): Bbox {
  const b = { s: Infinity, w: Infinity, n: -Infinity, e: -Infinity };
  for (const poly of polygons(g)) {
    for (const [x, y] of poly[0] ?? []) {
      b.w = Math.min(b.w, x!);
      b.e = Math.max(b.e, x!);
      b.s = Math.min(b.s, y!);
      b.n = Math.max(b.n, y!);
    }
  }
  return b;
}

/** Point-in-geometry test for a (multi)polygon, holes respected; the bounding box is checked first. */
export function insideTest(g: Geometry): (lon: number, lat: number) => boolean {
  const polys = polygons(g).map((rings) => ({ rings, box: geometryBbox({ type: "Polygon", coordinates: rings }) }));
  return (lon, lat) =>
    polys.some(
      ({ rings, box }) =>
        lon >= box.w && lon <= box.e && lat >= box.s && lat <= box.n && inRing(lon, lat, rings[0]!) && !rings.slice(1).some((h) => inRing(lon, lat, h)),
    );
}

/**
 * Stand-in for a city without an OSM boundary: a circle sized from the population
 * (about 2 500 people per km², radius 2–25 km).
 */
export function circlePolygon(lon: number, lat: number, population: number): Polygon {
  const km = Math.min(25, Math.max(2, Math.sqrt(population / 2500 / Math.PI)));
  const dLat = km / 111.32;
  const dLon = dLat / Math.cos(lat * RAD);
  const ring: Position[] = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Polygon", coordinates: [ring] };
}

/** Shoelace sum over lon/lat (y up): positive for a counter-clockwise ring. */
function planarArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  return a / 2;
}

/**
 * A boundary geometry as the MultiPolygon the globe expects, wound the way d3 wants it: GeoJSON
 * (RFC 7946, and so Nominatim) puts outer rings counter-clockwise, d3-geo reads that as "everything
 * except the city". Outer rings are made clockwise, holes counter-clockwise.
 */
export function asMultiPolygon(g: Geometry): MultiPolygon {
  const wind = (ring: Position[], clockwise: boolean) => ((planarArea(ring) < 0) === clockwise ? ring : ring.slice().reverse());
  return {
    type: "MultiPolygon",
    coordinates: polygons(g).map((rings) => rings.map((ring, i) => wind(ring, i === 0))),
  };
}

/** Planar area and perimeter of a closed ring (lon/lat, the first point need not be repeated). */
function areaPerimeter(ring: Position[]): [number, number] {
  let a = 0;
  let p = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
    p += Math.hypot(ring[i]![0]! - ring[j]![0]!, ring[i]![1]! - ring[j]![1]!);
  }
  return [Math.abs(a) / 2, p];
}

/** Removes the points where a ring doubles back on itself (a zero-width spike), until none is left. */
function withoutSpikes(ring: Position[]): Position[] {
  let pts = ring.slice(0, -1); // clipping output repeats the first point
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    const out: Position[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const ux = b[0]! - a[0]!;
      const uy = b[1]! - a[1]!;
      const vx = c[0]! - b[0]!;
      const vy = c[1]! - b[1]!;
      const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      // direction reverses (cos < −0.99): b is the tip of a spike
      if (len > 0 && (ux * vx + uy * vy) / len < -0.99) changed = true;
      else out.push(b);
    }
    pts = out;
  }
  return [...pts, pts[0]!];
}

/** Smallest ring kept, in pixels: area and average width (area / half the perimeter). */
export type RingLimits = { area: number; width: number };

/**
 * Clipping leaves slivers: spikes are cut off and rings under the limits are dropped. `outer` applies to polygons (a
 * polygon that goes is a stray fragment), `hole` to holes (a hole that goes is a lake or island too small to outline).
 * `pxDeg` is the size of a screen pixel in degrees.
 */
export function cleanPolygons(
  polys: Position[][][],
  pxDeg: number,
  { outer = { area: 16, width: 1.5 }, hole = outer }: { outer?: RingLimits; hole?: RingLimits } = {},
): Position[][][] {
  const ok = (ring: Position[], lim: RingLimits) => {
    if (ring.length < 4) return false;
    const [a, p] = areaPerimeter(ring);
    return a > lim.area * pxDeg * pxDeg && a / (p / 2) > lim.width * pxDeg;
  };
  return polys
    .map((rings) => rings.map(withoutSpikes))
    .map((rings) => [rings[0]!, ...rings.slice(1).filter((r) => ok(r, hole))])
    .filter((rings) => ok(rings[0]!, outer));
}
