import type { Provenance } from "../schemas/constraints";

const round1 = (x: number) => Math.round(x * 10) / 10 + 0; // + 0 turns -0 into 0

/** Metres, one decimal at most: 12.5 m, 15 m. */
export const fmtM = (x: number) => `${round1(x)} m`;
export const fmtM2 = (x: number) => `${Math.round(x)} m²`;
/** Coverage, FAR: two decimals. */
export const fmtRatio = (x: number) => x.toFixed(2);
export const statusLabel = (p: Provenance) => p.status.replace("_", " ");
