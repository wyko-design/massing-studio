import { EDGE_CELLS, LAYOUT, SQUARE, modelWindow, type Cells, type Grid } from "../landing/grid";

/**
 * The studio screens on the landing's page grid. Directions and Present: the site model's square in the middle (the
 * landing's model window, unchanged), a panel window at each side, as tall as the square. Rules: the square moves left and
 * the rules window opens at its right, centred together, as the globe and rules windows are on the landing.
 */
export const STUDIO = {
  /** Rows of the panels' bottom band (the landing's input band). */
  bandRows: 3,
  /** The rules window is the landing's, so its table's columns land on the same grid lines. */
  rulesCols: LAYOUT.windowCols,
} as const;

export type PanelCells = { panel: Cells; band: Cells };

export type StudioLayout = {
  logo: Cells;
  toggle: Cells;
  /** The site model's square (Directions, Present). */
  square: Cells;
  left: PanelCells;
  right: PanelCells;
  /** The rules screen: the square moved left, the rules window at its right. */
  rulesSquare: Cells;
  rules: { panel: Cells; panelBand: Cells };
};

const cells = (c0: number, c1: number, r0: number, r1: number): Cells => ({ c0, c1, r0, r1 });

const withBand = (panel: Cells): PanelCells => ({ panel, band: cells(panel.c0, panel.c1, panel.r1 - STUDIO.bandRows, panel.r1) });

export function studioLayout(g: Grid): StudioLayout {
  const square = modelWindow(g);
  const { r0, r1 } = square;
  const leftC1 = square.c0 - SQUARE.gap;
  const rightC0 = square.c1 + SQUARE.gap;
  const side = square.c1 - square.c0;
  const pair = side + SQUARE.gap + STUDIO.rulesCols;
  const p0 = Math.max(EDGE_CELLS, Math.floor((g.N - pair) / 2));
  const rulesPanel = cells(p0 + side + SQUARE.gap, p0 + pair, r0, r1);
  const { logo } = LAYOUT;
  return {
    logo,
    toggle: cells(g.N - logo.c0 - LAYOUT.toggleCells, g.N - logo.c0, logo.r0, logo.r0 + LAYOUT.toggleCells),
    square,
    left: withBand(cells(Math.max(EDGE_CELLS, leftC1 - SQUARE.panelMax), leftC1, r0, r1)),
    right: withBand(cells(rightC0, Math.min(g.N - EDGE_CELLS, rightC0 + SQUARE.panelMax), r0, r1)),
    rulesSquare: cells(p0, p0 + side, r0, r1),
    rules: { panel: rulesPanel, panelBand: withBand(rulesPanel).band },
  };
}
