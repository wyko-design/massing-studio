import { openRing, type Ring, type Volume } from "@massing/shared";
import type { FrameSize } from "./frame";

export type P3 = [number, number, number];
export type Projection = "ortho" | "perspective";

/**
 * A camera in world coordinates (three.js: x east, y up, z = −north). `zoom` is CSS px per metre for
 * the orthographic camera; `fov` (vertical, degrees) is used by the perspective camera.
 */
export type View = { projection: Projection; position: P3; target: P3; zoom: number; fov: number };

export const PRESETS = {
  ne: "NE axo",
  se: "SE axo",
  sw: "SW axo",
  nw: "NW axo",
  top: "Top",
  eye: "Eye level",
} as const;
export type Preset = keyof typeof PRESETS;

/** Orthographic cameras sit this far from their target; near < 0 keeps everything in view. */
export const ORTHO_DISTANCE = 400;
export const DEFAULT_FOV = 45;
export const EYE_HEIGHT = 1.6;
const EYE_FOV = 55;
const AXO_ELEVATION = 35;
/** Presets keep at least this radius (m) around the plot in the frame. */
const MIN_FOCUS_RADIUS = 40;

const AZIMUTHS: Record<"ne" | "se" | "sw" | "nw", number> = { ne: 45, se: 135, sw: 225, nw: 315 };
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Plan point (x east, y north) and a height → world. */
export const toWorld = (p: readonly [number, number], h = 0): P3 => [p[0], h, -p[1]];

/** Unit vector from the target towards a camera at azimuth (clockwise from north) and elevation. */
export function lookFrom(azimuthDeg: number, elevationDeg: number): P3 {
  const az = rad(azimuthDeg);
  const el = rad(elevationDeg);
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

const add = (a: P3, b: P3, s = 1): P3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: P3) => Math.hypot(a[0], a[1], a[2]);

export type Focus = {
  /** Plan centre of the parcel bounds. */
  centre: [number, number];
  /** Radius of the parcel bounds (m). */
  parcelRadius: number;
  /** Radius the axonometric presets keep in the frame (m). */
  radius: number;
  /** Top of the proposal (m), 0 without one. */
  height: number;
};

export function focusOf(parcelRing: Ring, proposal: Volume[] = []): Focus {
  const ring = openRing(parcelRing);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const centre: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const parcelRadius = Math.max(...ring.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1])));
  const height = Math.max(0, ...proposal.map((v) => v.zBase + v.height + (v.roof?.ridgeHeight ?? 0)));
  return { centre, parcelRadius, radius: Math.max(MIN_FOCUS_RADIUS, 3 * parcelRadius, 1.2 * height), height };
}

/** Same framing in the other projection: the visible height at the target stays the same. */
export function convertView(view: View, to: Projection, frame: FrameSize): View {
  if (view.projection === to) return view;
  const offset = sub(view.position, view.target);
  const d = len(offset) || 1;
  const dir: P3 = [offset[0] / d, offset[1] / d, offset[2] / d];
  const tanHalf = Math.tan(rad(view.fov) / 2);
  if (to === "perspective") {
    const visible = frame.height / view.zoom;
    return { ...view, projection: to, position: add(view.target, dir, visible / 2 / tanHalf) };
  }
  return { ...view, projection: to, position: add(view.target, dir, ORTHO_DISTANCE), zoom: frame.height / (2 * d * tanHalf) };
}

/** Orthographic view from an azimuth/elevation at a zoom (the workspace default). */
export function orbitView(target: P3, azimuthDeg: number, elevationDeg: number, zoom: number): View {
  return { projection: "ortho", position: add(target, lookFrom(azimuthDeg, elevationDeg), ORTHO_DISTANCE), target, zoom, fov: DEFAULT_FOV };
}

/**
 * Camera presets: four axonometric corners and a north-up top view, fitted so `focus.radius`
 * stays in the frame, in the requested projection. Eye level is always perspective, standing
 * across the street (or south of the plot when the street side is unknown).
 */
export function presetView(preset: Preset, focus: Focus, frame: FrameSize, projection: Projection, streetBearing: number | null): View {
  const target = toWorld(focus.centre);
  const zoom = Math.min(frame.width, frame.height) / (2 * focus.radius);
  if (preset === "eye") {
    const bearing = rad(streetBearing ?? 180);
    const dist = focus.parcelRadius + 26;
    const position = toWorld([focus.centre[0] + Math.sin(bearing) * dist, focus.centre[1] + Math.cos(bearing) * dist], EYE_HEIGHT);
    const lookHeight = Math.max(EYE_HEIGHT, Math.min(focus.height * 0.35, 8));
    return { projection: "perspective", position, target: toWorld(focus.centre, lookHeight), zoom, fov: EYE_FOV };
  }
  // top: a hair south of straight down, so the camera's up vector resolves to north
  const ortho: View =
    preset === "top"
      ? { projection: "ortho", position: add(target, [0, ORTHO_DISTANCE, 0.01]), target, zoom, fov: DEFAULT_FOV }
      : orbitView(target, AZIMUTHS[preset], AXO_ELEVATION, zoom);
  return convertView(ortho, projection, frame);
}
