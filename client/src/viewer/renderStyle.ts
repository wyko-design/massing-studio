import { TOKENS } from "../landing/tokens";

/**
 * The two looks of the site model (landing/model/modelStyle.ts LOOKS): "lines", its flat drawing with grey edges, and
 * "sun", the same lit by a low sun with shadows. The proposal is the only shaded mass in the line look.
 */
export const LOOKS = { lines: "Lines", sun: "Sun" } as const;
export type LookId = keyof typeof LOOKS;

/**
 * What the studio adds to the site model's own drawing (SPEC §10): the look, the proposal's mass and the label layer.
 * The Present screen edits it through `presentStore`; every screen and export renders with it.
 */
export type RenderStyle = {
  look: LookId;
  proposal: { colour: string; outlineColour: string; outlineWidth: number };
  /** Leader-line labels and street names, drawn on a 2D layer over the render. Sizes in frame px. */
  labels: { font: string; fontSize: number; colour: string; haloColour: string; tagBackground: string; tagColour: string };
};

export const defaultRenderStyle: RenderStyle = {
  look: "lines",
  proposal: { colour: TOKENS.blue, outlineColour: TOKENS.white, outlineWidth: 1 },
  labels: {
    font: '"ABC Areal", "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    colour: TOKENS.black,
    haloColour: "rgba(255,255,255,0.8)",
    tagBackground: TOKENS.blue,
    tagColour: TOKENS.white,
  },
};
