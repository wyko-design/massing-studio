import type { Position } from "geojson";
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
  buildings: { id: string; ring: [number, number][] }[];
};

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
