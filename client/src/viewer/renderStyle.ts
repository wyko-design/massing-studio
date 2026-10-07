/** Context colours per style. */
export const CONTEXT_STYLES = { white: "#f7f7f5", grey: "#cfcfcb" } as const;
export type ContextStyle = keyof typeof CONTEXT_STYLES;

/**
 * Every parameter of the presentation look in one place (SPEC §10).
 * The Present screen edits it through `presentStore`; every screen renders with it.
 */
export type RenderStyle = {
  /** Also the ground colour, so the ground never shows an edge or horizon. */
  background: string;
  parcelColour: string;
  /** White or grey matte context; hatched is a P11 item. */
  context: { style: ContextStyle };
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
  background: "#e6e6e3",
  parcelColour: "#dcdcd8",
  context: { style: "white" },
  proposal: { colour: "#c23350", outlineColour: "#111111", outlineWidth: 2 },
  envelope: { visible: true, fillColour: "#5b6b8c", fillOpacity: 0.08, lineColour: "#3a4560", lineWidth: 1.2, dashed: true },
  light: {
    date: "2026-09-21T09:30:00+02:00",
    sunIntensity: 2.2,
    skyIntensity: 2.1,
    skyColour: "#ffffff",
    bounceColour: "#bdbdb9",
    ambientIntensity: 0.15,
    shadowSoftness: 6,
    shadowMapSize: 4096,
    shadowOpacity: 0.4,
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
    font: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
    fontSize: 13,
    colour: "#111111",
    haloColour: "rgba(255,255,255,0.75)",
    tagBackground: "#111111",
    tagColour: "#ffffff",
  },
  camera: { elevation: 42, azimuth: 210, zoom: 7 },
};
