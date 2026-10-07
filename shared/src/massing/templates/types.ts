import type { MultiPolygon } from "polygon-clipping";
import type { Box } from "../fit";

/** What a template sees: the envelope in the building frame (u = axis, +v = front) and its box. */
export type TemplateContext = { env: MultiPolygon; box: Box };

/** Footprint for extent s ∈ (0, 1], already clipped to the envelope. Larger s → (roughly) more area. */
export type Shaper = (s: number) => MultiPolygon;

/** Feasibility before fitting: an adjusted depth (+ why), or a request to fall back to a slab. */
export type Prepared = { depth: number; clamps: string[] } | { fallback: string };

/**
 * A typology as rectangles in the building frame. The generator picks the variant with the most
 * area at s = 1, then solves s for the coverage target. Templates never see where the envelope
 * came from, the height rules or the floors.
 */
export interface Template {
  label: string;
  /** Number of placement variants (e.g. which corner an L sits in). */
  variants: number;
  prepare?(ctx: TemplateContext, depth: number): Prepared;
  shaper(ctx: TemplateContext, depth: number, variant: number): Shaper;
  /** Clamps about the fitted result at extent s. */
  review?(ctx: TemplateContext, depth: number, s: number): string[];
}
