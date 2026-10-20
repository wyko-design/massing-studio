import { TOKENS } from "../tokens";
import { globeStyle } from "../globe/globeStyle";

/** The waterways' outline grey (globeStyle.plot.waterLine), also the building edges. */
const LINE = globeStyle.plot.waterLine;

/** Look and timing of the site model (the 3D step after the rules). Times in ms from the arrow click's hand-over. */
export const modelStyle = {
  colours: {
    /** Ground: the page background, as in the 2D plot view. It runs on well past the data, so its edge is never seen. */
    ground: TOKENS.background,
    roadFill: TOKENS.white,
    roadLine: TOKENS.gridLine,
    waterFill: "#EAEAEA", // as globeStyle.plot
    waterLine: LINE,
    building: TOKENS.white,
    buildingLine: TOKENS.stroke,
    plot: TOKENS.blue,
    person: TOKENS.black,
  },
  /**
   * Surroundings loaded for the model: a radius of `perFrame` × the plot frame (`frameM`), at least `minM`. A large plot
   * gets less in proportion (`bigPerFrame` × frame + `bigExtraM`: the end view plus some room to pan and zoom out), and
   * never more than `maxM` (the server's cap). The zoom-out and pan limits are worked out from it (see `viewLimits`).
   */
  context: { perFrame: 2.2, minM: 180, bigPerFrame: 1.45, bigExtraM: 150, maxM: 2500 },
  /** The 3D copy is built this long after the rules have loaded (hidden; the arrow then starts at once). */
  prewarmMs: 800,
  /** The 2D map fades out over this long; the 3D copy under it is identical at that moment. */
  handOverMs: 300,
  /** The window grows to the square and moves to the centre (the rules window fades out over the first 300 ms). */
  windowMs: 1200,
  /**
   * Top view → isometric: polar angle from straight down (true isometric: 54.74°), turn about the vertical. The end view
   * shows `viewFrames` × the plot frame across the window's width.
   */
  camera: { delayMs: 100, ms: 1800, polarDeg: 54.7356, azimuthDeg: 45, viewFrames: 1.15 },
  /**
   * The sequence after the camera has turned (everything is flat until then): the buildable envelope rises as a dashed
   * blue ghost, then the buildings rise from the plot outwards, then the people appear. Each step starts when the one
   * before has finished (see `sequence`); only the lengths are set here. Buildings: spread from the plot to `rippleFrames`
   * × the plot frame, rise time of each. Ghost dash and gap in screen px.
   */
  rise: { spreadMs: 1100, ms: 800, rippleFrames: 1 },
  ghost: { ms: 900, dashPx: 5, gapPx: 3, fillOpacity: 0.06 },
  /** People (each grows in over `popS`): density on the walkable lines, cap, walking speed (m/s). */
  movers: { popS: 0.5, peoplePerM: 1 / 25, maxPeople: 120, walk: [1.1, 1.6] },
  /**
   * After the animation: left drag pans over the ground (up to `panFrac` of the end view's width from the plot), right
   * drag turns, wheel zooms (relative to the end view; the zoom-out stops before the data's edge could show).
   */
  orbit: { minPolarDeg: 0, maxPolarDeg: 62, minZoom: 0.8, maxZoom: 4, panFrac: 0.3 },
  /** White wash along the inner edges of the window, as the 2D views draw it (px). */
  washPx: globeStyle.vignetteWidth,
  /** Buildings without a 3DBAG height are drawn as a flat footprint this thick (m). */
  unknownHeightM: 0.2,
  /** Thickness of a building before it rises (m): its top face covers the ground layers, as the 2D footprint fill does. */
  flatM: 0.02,
};

/** Start times (ms from the hand-over) of the ghost, the rising buildings and the people; without an envelope the ghost step is skipped. */
export function sequence(hasGhost: boolean) {
  const flat = modelStyle.camera.delayMs + modelStyle.camera.ms;
  const ghost = flat;
  const rise = hasGhost ? ghost + modelStyle.ghost.ms : flat;
  const people = rise + modelStyle.rise.spreadMs + modelStyle.rise.ms;
  return { ghost, rise, people };
}

/**
 * Lighting looks for the model (trial: switchable in the model window, keys 1–5). `light` null = flat line drawing.
 * Fractions of white: `ambient` is the brightness of a face out of the sun, `sun` is added × cos(angle to the sun);
 * the sun stands `elevationDeg` high in compass direction `azimuthDeg` (90 = east). `shadow` is the darkening of the
 * ground in shade, `softness` the shadow edge blur (shadow-map texels). `lines` null = no edges.
 */
export type Look = {
  id: string;
  label: string;
  lines: string | null;
  light: { ambient: number; sun: number; elevationDeg: number; azimuthDeg: number; shadow: number; softness: number } | null;
  ao: { radius: number; intensity: number } | null;
};

export const LOOKS: Look[] = [
  { id: "lines", label: "Lines", lines: LINE, light: null, ao: null },
  // the camera looks north-east, so shadows only show when they fall sideways across the view (south-east or north-west)
  // reference 1: shadows fall to the right (sun in the north-west: graphic, not a real Dutch sun), lit west walls, edges kept
  { id: "sun", label: "Sun", lines: LINE, light: { ambient: 0.8, sun: 0.45, elevationDeg: 40, azimuthDeg: 300, shadow: 0.14, softness: 1 }, ao: null },
];

/** Context radius (m) the model asks the server for, for a plot frame of `frameM`. */
export const contextRadius = (frameM: number) => {
  const c = modelStyle.context;
  return Math.round(Math.min(c.maxM, Math.max(c.minM, Math.min(c.perFrame * frameM, c.bigPerFrame * frameM + c.bigExtraM))));
};

/**
 * Zoom (px per m) of the end view and the furthest the user may zoom out, and the pan limit (m), for a window of `w` × `h`
 * px and data reaching `radiusM` from the plot. At the furthest zoom-out, steepest tilt and furthest pan, the ground
 * the window shows (a rectangle, any rotation) still lies inside 95 % of the radius.
 *
 * The end view always shows the plot (`viewFrames` × its frame). When the data cannot also hold the full pan and zoom-out,
 * those freedoms shrink together first; only when even the bare end view would reach the data's edge does it zoom in.
 */
export function viewLimits(w: number, h: number, frameM: number, radiusM: number): { endZoom: number; minZoom: number; maxZoom: number; panM: number } {
  const o = modelStyle.orbit;
  const endZoom = w / (modelStyle.camera.viewFrames * frameM);
  // half-diagonal (m) of the ground seen at zoom s: K / s
  const K = 0.5 * Math.hypot(w, h / Math.cos(o.maxPolarDeg * (Math.PI / 180)));
  const reach = 0.95 * radiusM;
  for (let k = 20; k >= 1; k--) {
    const s = k / 20;
    const minZoom = endZoom * (1 - (1 - o.minZoom) * s);
    const panM = (o.panFrac * s * w) / endZoom;
    if (K / minZoom + panM <= reach) return { endZoom, minZoom, maxZoom: endZoom * o.maxZoom, panM };
  }
  if (K / endZoom <= reach) return { endZoom, minZoom: endZoom, maxZoom: endZoom * o.maxZoom, panM: 0 };
  const z = K / reach;
  return { endZoom: z, minZoom: z, maxZoom: z * o.maxZoom, panM: 0 };
}
