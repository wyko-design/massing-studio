/**
 * Page grid (UI-1 §4). Everything on the landing screen is placed in cell coordinates.
 *
 * Grid line i is the 1 px column [ox + cell·i, ox + cell·i + 1); rows likewise. A box spanning
 * lines i→j (cols) and k→l (rows) gets left = ox + cell·i and width = cell·(j − i) + 1 with
 * border-box sizing, so its 1 px border sits exactly on both grid lines.
 */

/** Cell size (px). 24 and 16 px layouts were tried on 2026-10-16; 32 was kept. */
export const CELL = 32;

export type Grid = {
  cell: number;
  /** Whole cells across / down. Lines 0..N and 0..M are drawn. */
  N: number;
  M: number;
  /** Pixel of line 0 (CSS px, integer). */
  ox: number;
  oy: number;
  /** Page size the lines extend over (CSS px). Height exceeds the viewport when the page scrolls. */
  width: number;
  height: number;
  dpr: number;
};

/** Cells spanned by a box, as grid line indices: cols c0→c1, rows r0→r1. */
export type Cells = { c0: number; c1: number; r0: number; r1: number };

export type BoxStyle = { left: number; top: number; width: number; height: number };

const isWhole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

/**
 * Centring offset, nudged down (≤ 7 px) so that it also falls on a whole device pixel when a cell
 * is a whole number of device pixels (dpr 1.25, 1.5, 1.75, 2, …). Then every grid line does.
 */
export function snapOrigin(margin: number, dpr: number, cell = CELL): number {
  const o = Math.floor(margin / 2);
  if (!isWhole(cell * dpr)) return o;
  for (let d = 0; d <= Math.min(o, 7); d++) if (isWhole((o - d) * dpr)) return o - d;
  return o;
}

/**
 * Grid for a viewport. When fewer than `minRows` rows fit, the page grows to `minRows` rows
 * (origin at the top) and scrolls vertically instead of breaking the grid.
 */
export function computeGrid(vw: number, vh: number, dpr = 1, minRows = 0, cell = CELL): Grid {
  const N = Math.floor(vw / cell);
  const fitRows = Math.floor(vh / cell);
  const ox = snapOrigin(vw - cell * N, dpr, cell);
  if (fitRows >= minRows) {
    return { cell, N, M: fitRows, ox, oy: snapOrigin(vh - cell * fitRows, dpr, cell), width: vw, height: vh, dpr };
  }
  // the last line must be on the page, so the page is one pixel taller than the cells
  return { cell, N, M: minRows, ox, oy: 0, width: vw, height: cell * minRows + 1, dpr };
}

/**
 * Cells at each page edge (top, bottom, left, right) that get no lines of their own: the outermost
 * lines 0, N (and 0, M) are not drawn, so those strips only show the other lines running out to
 * the page edge.
 */
export const EDGE_CELLS = 1;

/** Indices of the drawn lines: cols EDGE_CELLS..N − EDGE_CELLS, rows EDGE_CELLS..M − EDGE_CELLS. */
export function drawnLines(g: Grid): { cols: number[]; rows: number[] } {
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  return { cols: range(EDGE_CELLS, g.N - EDGE_CELLS), rows: range(EDGE_CELLS, g.M - EDGE_CELLS) };
}

/** Left pixel of vertical grid line i. */
export const lineX = (g: Grid, i: number) => g.ox + g.cell * i;
/** Top pixel of horizontal grid line k. */
export const lineY = (g: Grid, k: number) => g.oy + g.cell * k;

/** Border-box position of a box spanning grid lines c0→c1 and r0→r1 (border on the lines). */
export function boxStyle(g: Grid, b: Cells): BoxStyle {
  return {
    left: lineX(g, b.c0),
    top: lineY(g, b.r0),
    width: g.cell * (b.c1 - b.c0) + 1,
    height: g.cell * (b.r1 - b.r0) + 1,
  };
}

/** Same box shifted by whole cells (window-local → page cells). */
export const offsetCells = (b: Cells, dc: number, dr: number): Cells => ({
  c0: b.c0 + dc,
  c1: b.c1 + dc,
  r0: b.r0 + dr,
  r1: b.r1 + dr,
});

const cells = (c0: number, c1: number, r0: number, r1: number): Cells => ({ c0, c1, r0, r1 });

/** The landing layout in grid cells. Window-local cells: (0,0) = the window's top-left grid line. */
export type LayoutSpec = {
  /** Logo in page cells; the grid toggle mirrors its margin and is `toggleCells` square. */
  logo: Cells;
  toggleCells: number;
  windowCols: number;
  windowRows: number;
  /** Lowest window row (keeps the window clear of the logo). */
  minRow: number;
  local: { topBand: Cells; globe: Cells; inputBand: Cells; field: Cells; button: Cells; hookRow: number };
};

/** The snapped Figma layout (UI-1 §5) on the 32 px grid. */
export const LAYOUT: LayoutSpec = {
  // two cells in from the top-left corner (one past the edge strip); the toggle mirrors it on the right
  logo: cells(2, 6, 2, 4),
  toggleCells: 1,
  windowCols: 15,
  windowRows: 19,
  minRow: 4,
  local: {
    topBand: cells(0, 15, 0, 16),
    globe: cells(2, 13, 2, 13),
    inputBand: cells(0, 15, 16, 19),
    field: cells(4, 10, 17, 18),
    button: cells(10, 11, 17, 18),
    hookRow: 14,
  },
};

/** Most address suggestions shown; the list hangs below the field, one grid row each. */
export const SUGGEST_ROWS = 5;

/** Rows the landing needs: window at its lowest row, plus room for the suggestion list below the field. */
export const LANDING_MIN_ROWS = LAYOUT.minRow + LAYOUT.windowRows + SUGGEST_ROWS;
export type LandingLayout = {
  logo: Cells;
  toggle: Cells;
  window: Cells;
  topBand: Cells;
  globe: Cells;
  inputBand: Cells;
  field: Cells;
  button: Cells;
  hookRow: number;
  /** The rules window: same size as `window`, one cell to its right. Only meaningful when the layout was made with `paired`. */
  panel: Cells;
  panelBand: Cells;
};

/**
 * The square around the site model and the studio panels beside it. The square keeps the globe window's height (the
 * reference layout), grows on big pages while both panels keep their full width, and shrinks on narrow ones so the panels
 * keep their minimum width. Its rows stay clear of the logo, since the left panel shares the logo's columns.
 */
export const SQUARE = { maxSide: 25, panelMin: 11, panelMax: 15, gap: 1, bottomCells: 2 } as const;

/** The site model window: the globe window grown to a square (see SQUARE), centred on the page. It stays the studio's viewport. */
export function modelWindow(g: Grid, spec: LayoutSpec = LAYOUT): Cells {
  const S = SQUARE;
  const top = spec.logo.r1 + 1;
  const room = (panel: number) => g.N - 2 * (panel + S.gap + EDGE_CELLS);
  const grown = Math.min(S.maxSide, g.M - top - S.bottomCells, room(S.panelMax));
  const side = Math.max(1, Math.min(Math.max(spec.windowRows, grown), room(S.panelMin)));
  const col = Math.max(0, Math.floor((g.N - side) / 2));
  const row = Math.max(top, Math.floor((g.M - side) / 2));
  return cells(col, col + side, row, row + side);
}

/** A box between two others, `t` ∈ [0, 1], on whole pixels. */
export const lerpBox = (a: BoxStyle, b: BoxStyle, t: number): BoxStyle => ({
  left: Math.round(a.left + (b.left - a.left) * t),
  top: Math.round(a.top + (b.top - a.top) * t),
  width: Math.round(a.width + (b.width - a.width) * t),
  height: Math.round(a.height + (b.height - a.height) * t),
});

/** Cells between the globe window and the rules window. */
export const PANEL_GAP = 1;

/**
 * Page-cell layout of the landing screen (reference 1440×928 = 45×29 cells → window at x 480, y 160).
 * `paired`: the rules window is open; the two windows are centred together, so the globe window moves left.
 */
export function landingLayout(g: Grid, spec: LayoutSpec = LAYOUT, paired = false): LandingLayout {
  const total = paired ? 2 * spec.windowCols + PANEL_GAP : spec.windowCols;
  const col = Math.max(0, Math.floor((g.N - total) / 2));
  const row = Math.max(spec.minRow, Math.floor((g.M - spec.windowRows) / 2));
  const { logo, local } = spec;
  return {
    logo,
    toggle: cells(g.N - logo.c0 - spec.toggleCells, g.N - logo.c0, logo.r0, logo.r0 + spec.toggleCells),
    window: cells(col, col + spec.windowCols, row, row + spec.windowRows),
    topBand: offsetCells(local.topBand, col, row),
    globe: offsetCells(local.globe, col, row),
    inputBand: offsetCells(local.inputBand, col, row),
    field: offsetCells(local.field, col, row),
    button: offsetCells(local.button, col, row),
    hookRow: row + local.hookRow,
    panel: cells(col + spec.windowCols + PANEL_GAP, col + 2 * spec.windowCols + PANEL_GAP, row, row + spec.windowRows),
    panelBand: offsetCells(local.inputBand, col + spec.windowCols + PANEL_GAP, row),
  };
}
