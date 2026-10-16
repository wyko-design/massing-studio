import { TOKENS } from "../tokens";
import type { DotStyle } from "./dots";
import type { LonLat } from "./geo";

/** Every look and motion parameter of the landing globe. */
export const globeStyle = {
  /** Sphere fill behind the dots (land and water). */
  water: TOKENS.white,
  outline: TOKENS.stroke,
  border: TOKENS.stroke,
  selectedBorder: TOKENS.blue,
  dots: {
    /** "even": evenly spaced on the ground, staggered rows; "latlon": a plain lon/lat grid. */
    lattice: { mode: "even", baseDeg: 180 / 138 },
    // at the idle radius (176 px) 180/138° ≈ 4 px: eight dots per 32 px grid cell, reads as a grey tone
    spacingPx: 4,
    radiusPx: 0.75,
    // finest lattice level: 4 px spacing at level k needs a scale of 4 · 2^k / 0.0228 px; level 13 ≈ 1.4 M px (a 1.5 km frame)
    maxLevel: 13,
    colour: TOKENS.stroke,
    selectedColour: TOKENS.blue,
  } satisfies DotStyle as DotStyle,
  /** The dots pop in (random subset growing to all) over this long after the page loads (ms). */
  introMs: 400,
  /** Other countries in the country view: solid fill (no dots), faded in over these zoom levels. */
  otherFill: TOKENS.background,
  fillFade: [0, 0.5] as [number, number],
  /** White (TOKENS.white, 255/255/255 in the gradient) inner blur along the frame's edges once zoomed in: depth (px) and the zoom levels it fades in over. */
  vignetteWidth: 56,
  vignetteFade: [0.5, 2] as [number, number],
  /** Coastlines are always drawn. Country borders too when true; otherwise they fade in with the zoom. */
  idleBorders: false,
  /** Zoom levels over which country borders fade in when idleBorders is false (0 = idle globe). */
  bordersFade: [0.5, 2] as [number, number],
  /** Zoom levels over which the 110m coastlines give way to the 50m ones. */
  coastDetailFade: [1, 2] as [number, number],
  /** Islands and lakes smaller than this across on screen get no outline (px). */
  minLoopPx: 6,
  /** Idle spin around the vertical axis (deg/s) and the view on load: Europe readable, tilted north. */
  spinDegPerSec: 4,
  initialCentre: [10, 30] as LonLat,
  /** Country sequence: the globe pans over the country, it turns blue, then a rapid zoom in. Back: the reverse. */
  panMs: 1500,
  blueMs: 600,
  /** Pause on the blue country before the zoom starts. */
  holdMs: 400,
  zoomMs: 800,
  /** City sequence: pan to the city, (wait for its boundary), blue switch, hold, rapid zoom in. */
  cityPanMs: 1300,
  cityWaitMs: 15000,
  cityZoomMs: 1400,
  /** Plot sequence: pan to the address, blue switch to the parcel, hold, rapid zoom in (≈ 300× in scale, so a little longer). */
  plotZoomMs: 1800,
  /** Map details (roads, water) fade in over these zoom levels. The dots stay, at the same screen density at every zoom. */
  detailsFade: [7, 9] as [number, number],
  /** Longest the sequence waits after the blue fade for the dots of the zoom to be ready. */
  warmWaitMs: 800,
  /** Share of the frame the selected country's main polygon fills (tighter axis). */
  countryFill: 0.5,
  /** Zoom limits relative to the idle globe radius. */
  minZoom: 1,
  maxZoom: 60,
};

export type GlobeStyle = typeof globeStyle;
