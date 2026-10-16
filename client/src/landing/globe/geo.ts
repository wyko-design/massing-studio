import { geoArea, geoCentroid, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";

export type LonLat = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };

/** Everything that places the globe on the canvas (canvas CSS px). */
export type View = {
  /** Lon/lat at the centre of the projection. */
  centre: LonLat;
  /** Orthographic scale = globe radius in px. */
  scale: number;
  /** Projection centre on the canvas. */
  cx: number;
  cy: number;
  /** Visible map frame; everything is clipped to it. */
  clip: Rect;
};

/** Largest polygon of a (multi)polygon by spherical area: France → mainland, not French Guiana. */
export function mainPolygon(g: Polygon | MultiPolygon): Polygon {
  if (g.type === "Polygon") return g;
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of g.coordinates) {
    const p: Polygon = { type: "Polygon", coordinates };
    const a = geoArea(p);
    if (a > bestArea) [best, bestArea] = [p, a];
  }
  if (!best) throw new Error("Empty geometry");
  return best;
}

/** Point the camera turns to for a country: centroid of its main polygon. */
export const countryCentre = (g: Polygon | MultiPolygon): LonLat => geoCentroid(mainPolygon(g)) as LonLat;

/**
 * Scale at which `polygon`, seen from `centre`, fills `fill` of the frame along its tighter axis.
 */
export function fitScale(polygon: Polygon, centre: LonLat, frame: { w: number; h: number }, fill: number): number {
  const p = geoOrthographic().rotate([-centre[0], -centre[1], 0]).scale(1).translate([0, 0]).clipAngle(90);
  const [[x0, y0], [x1, y1]] = geoPath(p).bounds(polygon);
  const w = Math.max(x1 - x0, 1e-6);
  const h = Math.max(y1 - y0, 1e-6);
  return fill * Math.min(frame.w / w, frame.h / h);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Blends two views with separate progress for the turn (great-circle rotation) and the zoom
 * (geometric scale and projection centre), each in [0, 1].
 */
export function viewBlend(a: View, b: View): (turn: number, zoom: number) => View {
  const centre = geoInterpolate(a.centre, b.centre);
  return (turn, zoom) => ({
    centre: centre(turn) as LonLat,
    scale: a.scale * Math.pow(b.scale / a.scale, zoom),
    cx: lerp(a.cx, b.cx, zoom),
    cy: lerp(a.cy, b.cy, zoom),
    clip: b.clip,
  });
}
