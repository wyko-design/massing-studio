import { LAYOUT, type Cells, type Grid } from "../landing/grid";

/**
 * The studio screens (rules, Directions, Present) on the landing's page grid: a viewer window on the left and a panel
 * window on the right, centred together with one cell between them, like the globe and rules windows. Both are taller
 * than the landing's windows when the page allows (the panels hold more), never shorter.
 */
export const STUDIO = {
  /** The panel is as wide as the rules window, so the rules table's columns land on the same grid lines. */
  panelCols: 15,
  gap: 1,
  /** Rows of the bottom band of both windows (the landing's input band). */
  bandRows: 3,
  minRows: LAYOUT.windowRows,
  maxRows: 25,
  minViewerCols: 15,
  /** Free cells kept at each side of the pair, above the windows (below the logo) and below them. */
  sideCells: 2,
  topCells: 1,
  bottomCells: 2,
} as const;

export type StudioLayout = {
  logo: Cells;
  toggle: Cells;
  viewer: Cells;
  /** The viewer window's 3D part (above its band). */
  canvas: Cells;
  viewerBand: Cells;
  panel: Cells;
  panelBand: Cells;
};

/** Rows the studio needs: the window at its lowest row plus the free rows below. */
export const STUDIO_MIN_ROWS = LAYOUT.logo.r1 + STUDIO.topCells + STUDIO.minRows + STUDIO.bottomCells;

const cells = (c0: number, c1: number, r0: number, r1: number): Cells => ({ c0, c1, r0, r1 });

export function studioLayout(g: Grid): StudioLayout {
  const S = STUDIO;
  // the windows start a free row below the logo (it is in the windows' columns)
  const minRow = LAYOUT.logo.r1 + S.topCells;
  const rows = Math.min(S.maxRows, Math.max(S.minRows, g.M - minRow - S.bottomCells));
  const r0 = Math.max(minRow, Math.floor((g.M - rows) / 2));
  const r1 = r0 + rows;
  // the viewer takes what is left beside the panel, up to a little wider than tall
  const free = g.N - 2 * S.sideCells - S.panelCols - S.gap;
  const viewerCols = Math.max(S.minViewerCols, Math.min(free, rows + 12));
  const total = viewerCols + S.gap + S.panelCols;
  const c0 = Math.max(0, Math.floor((g.N - total) / 2));
  const v1 = c0 + viewerCols;
  const p0 = v1 + S.gap;
  const { logo } = LAYOUT;
  return {
    logo,
    toggle: cells(g.N - logo.c0 - LAYOUT.toggleCells, g.N - logo.c0, logo.r0, logo.r0 + LAYOUT.toggleCells),
    viewer: cells(c0, v1, r0, r1),
    canvas: cells(c0, v1, r0, r1 - S.bandRows),
    viewerBand: cells(c0, v1, r1 - S.bandRows, r1),
    panel: cells(p0, p0 + S.panelCols, r0, r1),
    panelBand: cells(p0, p0 + S.panelCols, r1 - S.bandRows, r1),
  };
}
