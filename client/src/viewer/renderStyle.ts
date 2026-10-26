import { TOKENS } from "../landing/tokens";

/** Context colours per style. */
export const CONTEXT_STYLES = { white: TOKENS.white, grey: "#E5E5E5" } as const;
export type ContextStyle = keyof typeof CONTEXT_STYLES;

/**
 * The two looks. "lines": the landing's site-model drawing (flat white context with grey edges, no shadows, blue plot),
 * the proposal the only shaded mass. "sun": the same colours, lit by the real sun with shadows and ambient occlusion.
 */
export const LOOKS = { lines: "Lines", sun: "Sun" } as const;
export type LookId = keyof typeof LOOKS;

/** Building edges of the line look: the site model's line grey (globeStyle.plot.waterLine). */
const EDGE = "#DFDFDF";

/**
 * Every parameter of the presentation look in one place (SPEC §10).
 * The Present screen edits it through `presentStore`; every screen renders with it.
 */
export type RenderStyle = {
  look: LookId;
  /** Also the ground colour, so the ground never shows an edge or horizon. */
  background: string;
  parcelColour: string;
  /** Outline and dots of the plot (line look). */
  parcelLine: string;
  /** White or grey matte context; hatched is a P11 item. `edges`: edge colour in the line look. */
  context: { style: ContextStyle; edges: string };
  proposal: { colour: string; outlineColour: string; outlineWidth: number };
  /** Ghost of the buildable envelope: faint fill, dashed edges. Never casts shadows. */
  envelope: { visible: boolean; fillColour: string; fillOpacity: number; lineColour: string; lineWidth: number; dashed: boolean };
  light: {
    /** ISO date-time with explicit UTC offset, so the sun does not depend on the machine's time zone. */
    date: string;
    sunIntensity: number;
    /**
     * Hemisphere fill: roofs get the sky colour, walls a 50/50 mix with the bounce colour.
     * A darker bounce colour makes shaded walls greyer while roofs stay white.
     */
    skyIntensity: number;
    skyColour: string;
    bounceColour: string;
    ambientIntensity: number;
    /** PCF filter radius in shadow-map texels. */
    shadowSoftness: number;
    shadowMapSize: number;
    /** Darkness of shadows cast on the ground, 0–1. */
    shadowOpacity: number;
  };
  ao: {
    enabled: boolean;
    /** World metres. */
    radius: number;
    distanceFalloff: number;
    intensity: number;
    colour: string;
    quality: "performance" | "low" | "medium" | "high" | "ultra";
  };
  /** Leader-line labels and street names, drawn on a 2D layer over the render. Sizes in frame px. */
  labels: { font: string; fontSize: number; colour: string; haloColour: string; tagBackground: string; tagColour: string };
  /** Starting camera of the workspace; Present mode uses presets and saved views. */
  camera: {
    /** Degrees above the horizon. */
    elevation: number;
    /** Degrees clockwise from north that the camera looks from (135 = from the south-east). */
    azimuth: number;
    zoom: number;
  };
};

export const defaultRenderStyle: RenderStyle = {
  look: "lines",
  background: TOKENS.background,
  parcelColour: TOKENS.white,
  parcelLine: TOKENS.blue,
  context: { style: "white", edges: EDGE },
  proposal: { colour: TOKENS.blue, outlineColour: TOKENS.white, outlineWidth: 1 },
  envelope: { visible: true, fillColour: TOKENS.blue, fillOpacity: 0.06, lineColour: TOKENS.blue, lineWidth: 1, dashed: true },
  light: {
    date: "2026-09-21T09:30:00+02:00",
    sunIntensity: 2.2,
    skyIntensity: 2.1,
    skyColour: "#ffffff",
    bounceColour: "#bdbdb9",
    ambientIntensity: 0.15,
    shadowSoftness: 6,
    shadowMapSize: 4096,
    shadowOpacity: 0.3,
  },
  ao: {
    enabled: true,
    radius: 5,
    distanceFalloff: 1,
    intensity: 6,
    colour: "#000000",
    quality: "high",
  },
  labels: {
    font: '"ABC Areal", "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    colour: TOKENS.black,
    haloColour: "rgba(255,255,255,0.8)",
    tagBackground: TOKENS.blue,
    tagColour: TOKENS.white,
  },
  // the landing's site model: true isometric from the south-west
  camera: { elevation: 35.26, azimuth: 225, zoom: 7 },
};
