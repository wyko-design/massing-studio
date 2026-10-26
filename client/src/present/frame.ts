/**
 * The exported image is the studio's square, as it is on screen. Its base size is fixed; the resolution multiplies it.
 * An export draws the on-screen view at a higher pixel ratio, so pixel-defined sizes (lines, dots, label text) keep their
 * relation to the frame.
 */
export const SQUARE_PX = 1080;

export const MULTIPLIERS = [1, 2, 4] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export type FrameSize = { width: number; height: number };

/** Side (px) of a square export. */
export const exportSide = (multiplier: Multiplier) => SQUARE_PX * multiplier;
