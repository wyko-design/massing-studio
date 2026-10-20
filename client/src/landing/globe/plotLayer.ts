import type { Position } from "geojson";
import polygonClipping from "polygon-clipping";
import type { LonLat, Rect, View } from "./geo";

/** A chosen address with its cadastral parcel and the buildings around it (GET /api/geo/plot). */
export type PlotData = {
  id: string;
  label: string;
  /** The address point [lon, lat]. */
  point: LonLat;
  /** Every polygon of the parcel feature: [outer ring, ...holes] of [lon, lat]. */
  parcel: { id: string; areaM2: number | null; polygons: [number, number][][][] } | null;
  /** Width in metres of the frame's tighter axis. */
  frameM: number;
  /** Where the surroundings were fetched around [lon, lat] (the parcel's centre), and the half side (m) of their box. */
  centre?: LonLat;
  radiusM?: number;
  /** `height`: 3DBAG height in metres (older cached answers have none). */
  buildings: { id: string; ring: [number, number][]; height?: number }[];
  /** BGT ground surfaces around it: roads (carriageways, merged and simplified) and water. */
  ground: Record<GroundKind, [number, number][][][]>;
};

export type GroundKind = "road" | "water";

/** Mean earth radius (m): one radian of arc. At the scales used here the orthographic view is planar to well under a pixel. */
export const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

/** Scale (px per radian) at which the frame's tighter axis spans `frameM` metres. */
export const plotScale = (frame: { w: number; h: number }, frameM: number) => (Math.min(frame.w, frame.h) / frameM) * EARTH_R;

/** The camera for a plot: centred on the parcel (else the address point), `frameM` across the tighter axis. */
export function plotView(plot: PlotData, frame: Rect): View {
  const rings = plot.parcel?.polygons.map((p) => p[0]!) ?? [];
  const pts = rings.flat();
  const centre: LonLat = pts.length
    ? [(Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2, (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2]
    : plot.point;
  return { centre, scale: plotScale(frame, plot.frameM), cx: frame.x + frame.w / 2, cy: frame.y + frame.h / 2, clip: frame };
}

/** Flat local frame (metres east / north) around an origin, for the parcel's dot lattice. */
export type Local = { lon0: number; lat0: number; mx: number; my: number };

export function localFrame(origin: LonLat): Local {
  return { lon0: origin[0], lat0: origin[1], mx: EARTH_R * RAD * Math.cos(origin[1] * RAD), my: EARTH_R * RAD };
}

export const toLocal = (l: Local, lon: number, lat: number): [number, number] => [(lon - l.lon0) * l.mx, (lat - l.lat0) * l.my];
export const toLonLat = (l: Local, x: number, y: number): LonLat => [l.lon0 + x / l.mx, l.lat0 + y / l.my];

/** The parcel in local metres: polygons of rings, plus its bounding box. */
export type LocalParcel = { local: Local; polygons: Position[][][]; bbox: { x0: number; y0: number; x1: number; y1: number } };

export function localParcel(polygons: [number, number][][][], origin: LonLat): LocalParcel {
  const local = localFrame(origin);
  const out = polygons.map((poly) => poly.map((ring) => ring.map(([lon, lat]) => toLocal(local, lon, lat))));
  const pts = out.flat(2);
  return {
    local,
    polygons: out,
    bbox: {
      x0: Math.min(...pts.map((p) => p[0]!)),
      y0: Math.min(...pts.map((p) => p[1]!)),
      x1: Math.max(...pts.map((p) => p[0]!)),
      y1: Math.max(...pts.map((p) => p[1]!)),
    },
  };
}

/** Even-odd test over all rings of one polygon (holes count). */
function insidePolygon(x: number, y: number, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
    }
  }
  return inside;
}

export const insideParcel = (p: LocalParcel, x: number, y: number) => p.polygons.some((poly) => insidePolygon(x, y, poly));

const ringAreaDeg = (r: Position[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! - r[i]![0]!) * (r[j]![1]! + r[i]![1]!);
  return Math.abs(a / 2);
};

/** Share of a footprint that must lie on the parcel for the building to count as standing on it (party-wall noise stays below). */
const ON_PARCEL = 0.05;

/** The plot without the buildings standing on its parcel: the site is shown empty, ready for a design. */
export function clearParcel(plot: PlotData): PlotData {
  const polys = plot.parcel?.polygons;
  if (!polys?.length) return plot;
  const parcel = polys as never[];
  // a large box holds thousands of buildings: only those whose bbox touches the parcel's are clipped
  const pts = polys.flatMap((p) => p[0]!);
  const box = { w: Math.min(...pts.map((q) => q[0])), e: Math.max(...pts.map((q) => q[0])), s: Math.min(...pts.map((q) => q[1])), n: Math.max(...pts.map((q) => q[1])) };
  return {
    ...plot,
    buildings: plot.buildings.filter((b) => {
      let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
      for (const [lon, lat] of b.ring) (w = Math.min(w, lon)), (e = Math.max(e, lon)), (s = Math.min(s, lat)), (n = Math.max(n, lat));
      if (e < box.w || w > box.e || n < box.s || s > box.n) return true;
      const area = ringAreaDeg(b.ring);
      if (!area) return true;
      try {
        const cut = polygonClipping.intersection([b.ring] as never, ...parcel) as Position[][][];
        const shared = cut.reduce((t, p) => t + ringAreaDeg(p[0]!) - p.slice(1).reduce((h, r) => h + ringAreaDeg(r), 0), 0);
        return shared / area <= ON_PARCEL;
      } catch {
        return true; // a broken ring: leave the building rather than guess
      }
    }),
  };
}

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Dot lattice level for `pxPerM` on screen: spacing 2^−level metres lies between `spacingPx` and 2 × `spacingPx` pixels. */
export function plotLevel(pxPerM: number, spacingPx: number): { level: number; fade: number } {
  const ell = Math.log2(pxPerM / spacingPx);
  const level = Math.floor(ell);
  // the finer lattice's new dots fade in over the last 40 % of each doubling, as on the globe
  return { level, fade: smoothstep((ell - level - 0.5) / 0.4) };
}

/** Most dots the infill will draw in one frame (a safety net: it only reaches it when the parcel is huge on screen). */
export const MAX_PLOT_DOTS = 30000;

const mod2 = (n: number) => ((n % 2) + 2) % 2;

/**
 * Staggered-row lattice of spacing 2^−level m inside the parcel, fixed to the ground. Level L+1 contains every
 * dot of level L (row j, column i → row 2j, column 2i + (j mod 2)), so a finer level only adds dots.
 * Returns local metres; `fine` marks the dots that are new at `level + 1`.
 */
export function plotDots(parcel: LocalParcel, level: number, includeFine: boolean): { coarse: number[]; fine: number[] } {
  const coarse: number[] = [];
  const fine: number[] = [];
  const step = (l: number) => Math.pow(2, -l);
  const emit = (l: number, isCoarse: (i: number, j: number) => boolean, into: number[]) => {
    const s = step(l);
    const { x0, y0, x1, y1 } = parcel.bbox;
    const j0 = Math.floor(y0 / s) - 1;
    const j1 = Math.ceil(y1 / s) + 1;
    if (((j1 - j0) * (x1 - x0)) / s > MAX_PLOT_DOTS) return;
    for (let j = j0; j <= j1; j++) {
      const off = 0.5 * mod2(j);
      const i0 = Math.floor(x0 / s - off) - 1;
      const i1 = Math.ceil(x1 / s - off) + 1;
      for (let i = i0; i <= i1; i++) {
        if (!isCoarse(i, j)) continue;
        const x = (i + off) * s;
        const y = j * s;
        if (insideParcel(parcel, x, y)) into.push(x, y);
      }
    }
  };
  emit(level, () => true, coarse);
  // at the finer level, the dots that are not on the coarse lattice: odd rows, or even rows with the other column parity
  if (includeFine) emit(level + 1, (i, j) => !(mod2(j) === 0 && mod2(i) === mod2(j / 2)), fine);
  return { coarse, fine };
}
