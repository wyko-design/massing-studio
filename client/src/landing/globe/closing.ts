import polygonClipping from "polygon-clipping";
import type { Position } from "geojson";

type Pt = [number, number];
type Poly = Pt[][];

/** Douglas–Peucker on a closed ring (the first point is not repeated at the end). */
function simplifyRing(ring: Pt[], tol: number): Pt[] {
  if (ring.length <= 4) return ring;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    let idx = 0;
    let max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i]!, pts[0]!, pts[pts.length - 1]!);
      if (d > max) [max, idx] = [d, i];
    }
    if (max <= tol) return [pts[0]!, pts[pts.length - 1]!];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  let far = 1;
  let best = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i]![0] - ring[0]![0], ring[i]![1] - ring[0]![1]);
    if (d > best) [best, far] = [d, i];
  }
  const out = [...dp(ring.slice(0, far + 1)).slice(0, -1), ...dp([...ring.slice(far), ring[0]!]).slice(0, -1)];
  return out.length >= 3 ? out : ring;
}

const open = (r: Pt[]): Pt[] => {
  const a = r[0]!;
  const b = r[r.length - 1]!;
  return r.length > 1 && a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
};
const close = (r: Pt[]): Pt[] => [...r, r[0]!];

/** The polygons swept by `r` along every ring edge, as polygon-clipping input: a rectangle per edge, an octagon per vertex. */
function sweeps(polys: Poly[], r: number): Poly[] {
  const out: Poly[] = [];
  for (const poly of polys)
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l = Math.hypot(dx, dy);
        if (l > 0) {
          const nx = (-dy / l) * r;
          const ny = (dx / l) * r;
          out.push([close([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]])]);
        }
        out.push([close(Array.from({ length: 8 }, (_, k): Pt => [a[0] + r * Math.cos((k * Math.PI) / 4), a[1] + r * Math.sin((k * Math.PI) / 4)]))]);
      }
    }
  return out;
}

const simplified = (polys: Poly[], tol: number): Poly[] => polys.map((p) => p.map((ring) => simplifyRing(open(ring), tol)).filter((ring) => ring.length >= 3));

const asClip = (polys: Poly[]) => polys.map((p) => p.map(close)) as never;

/**
 * Morphological closing of lon/lat polygons: inlets, estuaries and gaps narrower than `2 · r` degrees (measured in
 * latitude degrees; longitudes are stretched by cos(lat) first) fill up, so the country reads as one body of land.
 * The result contains the input. Returns the input when the clipping fails.
 */
export function closePolygons(polys: Position[][][], r: number): Position[][][] {
  if (!polys.length || r <= 0) return polys;
  const lat0 = polys.flat(2).reduce((s, p, _, all) => s + p[1]! / all.length, 0);
  const k = Math.cos((lat0 * Math.PI) / 180);
  const toIso = (p: Position): Pt => [p[0]! * k, p[1]!];
  const fromIso = (p: Pt): Position => [p[0] / k, p[1]];
  try {
    const iso: Poly[] = polys.map((poly) => poly.map((ring) => open(ring.map(toIso))));
    const base = simplified(iso, r / 3);
    const dilated = polygonClipping.union(asClip(base), ...(sweeps(base, r).map((s) => asClip([s])) as never[]));
    const D = simplified(dilated as never as Poly[], r / 3);
    // erode: what is further than r from the dilated shape's edge
    const eroded = polygonClipping.difference(asClip(D), ...(sweeps(D, r).map((s) => asClip([s])) as never[]));
    // the closing contains the input: the eroded shape together with the (simplified) original
    const result = polygonClipping.union(eroded, asClip(iso)) as never as Poly[];
    return result.map((poly) => poly.map((ring) => ring.map(fromIso)));
  } catch {
    return polys;
  }
}
