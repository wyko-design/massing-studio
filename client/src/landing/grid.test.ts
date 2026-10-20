import { describe, expect, it } from "vitest";
import {
  CELL,
  LANDING_MIN_ROWS,
  boxStyle,
  computeGrid,
  drawnLines,
  EDGE_CELLS,
  landingLayout,
  lerpBox,
  modelWindow,
  lineX,
  lineY,
  snapOrigin,
  type Cells,
  type Grid,
} from "./grid";

const VIEWPORTS: [number, number][] = [
  [1440, 928],
  [1920, 1080],
  [1366, 768],
  [1365, 767],
  [1001, 701],
  [1537, 865],
];
const DPRS = [1, 1.25, 1.5, 2];

/** Pixel columns covered by the drawn vertical grid lines, and pixel rows covered by the horizontal ones. */
function linePixels(g: Grid) {
  const { cols, rows } = drawnLines(g);
  return { xs: new Set(cols.map((i) => lineX(g, i))), ys: new Set(rows.map((k) => lineY(g, k))) };
}

describe("computeGrid", () => {
  it("matches the Figma reference: 1440×928 = 45×29 cells, no margin", () => {
    const g = computeGrid(1440, 928);
    expect(g).toMatchObject({ N: 45, M: 29, ox: 0, oy: 0 });
  });

  it("centres the leftover margin on integer pixels", () => {
    const g = computeGrid(1366, 768);
    expect(g).toMatchObject({ N: 42, M: 24, ox: 11, oy: 0 });
    const h = computeGrid(1920, 1080);
    expect(h).toMatchObject({ N: 60, M: 33, ox: 0, oy: 12 });
    for (const [w, hgt] of VIEWPORTS) {
      const k = computeGrid(w, hgt);
      expect(Number.isInteger(k.ox) && Number.isInteger(k.oy)).toBe(true);
      expect(k.ox).toBeLessThan(CELL);
      expect(k.oy).toBeLessThan(CELL);
    }
  });

  it("puts the origin on a whole device pixel when a cell is whole device pixels", () => {
    for (const dpr of DPRS) {
      for (const [w, h] of VIEWPORTS) {
        const g = computeGrid(w, h, dpr);
        expect(Number.isInteger(g.ox * dpr)).toBe(true);
        expect(Number.isInteger(g.oy * dpr)).toBe(true);
        expect(g.ox).toBeLessThanOrEqual(Math.floor((w - CELL * g.N) / 2));
        expect(g.ox).toBeGreaterThanOrEqual(0);
      }
    }
    // 32 × 1.1 is not whole: plain centring
    expect(snapOrigin(22, 1.1)).toBe(11);
  });

  it("grows the page instead of breaking the grid when the window does not fit", () => {
    const g = computeGrid(1280, 600, 1, LANDING_MIN_ROWS);
    expect(g.M).toBe(LANDING_MIN_ROWS);
    expect(g.oy).toBe(0);
    expect(g.height).toBe(CELL * LANDING_MIN_ROWS + 1);
    const L = landingLayout(g);
    expect(L.window.r0).toBe(4);
    expect(L.window.r1).toBeLessThan(g.M);
    // tall enough: the viewport is used as is
    expect(computeGrid(1280, 1000, 1, LANDING_MIN_ROWS).height).toBe(1000);
  });
});

describe("drawnLines", () => {
  it("leaves out the outermost line on every side", () => {
    const g = computeGrid(1440, 928);
    const { cols, rows } = drawnLines(g);
    expect(EDGE_CELLS).toBe(1);
    expect(cols[0]).toBe(1);
    expect(cols[cols.length - 1]).toBe(g.N - 1);
    expect(rows[0]).toBe(1);
    expect(rows[rows.length - 1]).toBe(g.M - 1);
    expect(cols).toHaveLength(g.N - 1);
  });
});

describe("boxStyle", () => {
  it("puts all four border pixels on grid-line pixels", () => {
    for (const dpr of DPRS) {
      for (const [w, h] of VIEWPORTS) {
        const g = computeGrid(w, h, dpr, LANDING_MIN_ROWS);
        const { xs, ys } = linePixels(g);
        const L = landingLayout(g);
        const boxes: Cells[] = [L.logo, L.toggle, L.window, L.topBand, L.globe, L.inputBand, L.field, L.button];
        for (const b of boxes) {
          const s = boxStyle(g, b);
          const right = s.left + s.width - 1;
          const bottom = s.top + s.height - 1;
          expect(xs.has(s.left), `left ${w}×${h}@${dpr}`).toBe(true);
          expect(xs.has(right), `right ${w}×${h}@${dpr}`).toBe(true);
          expect(ys.has(s.top), `top ${w}×${h}@${dpr}`).toBe(true);
          expect(ys.has(bottom), `bottom ${w}×${h}@${dpr}`).toBe(true);
          expect(right).toBe(lineX(g, b.c1));
          expect(bottom).toBe(lineY(g, b.r1));
        }
      }
    }
  });

  it("lets adjacent boxes share one line", () => {
    const g = computeGrid(1440, 928);
    const L = landingLayout(g);
    const field = boxStyle(g, L.field);
    const button = boxStyle(g, L.button);
    expect(field.left + field.width - 1).toBe(button.left);
    const top = boxStyle(g, L.topBand);
    const band = boxStyle(g, L.inputBand);
    expect(top.top + top.height - 1).toBe(band.top);
  });
});

describe("landingLayout", () => {
  it("reproduces the snapped targets at 1440×928", () => {
    const g = computeGrid(1440, 928);
    const L = landingLayout(g);
    expect(g.cell).toBe(32);
    expect(boxStyle(g, L.logo)).toEqual({ left: 64, top: 64, width: 129, height: 65 });
    expect(boxStyle(g, L.window)).toEqual({ left: 480, top: 160, width: 481, height: 609 });
    expect(boxStyle(g, L.globe)).toEqual({ left: 544, top: 224, width: 353, height: 353 });
    expect(boxStyle(g, L.field)).toEqual({ left: 608, top: 704, width: 193, height: 33 });
    expect(boxStyle(g, L.button)).toEqual({ left: 800, top: 704, width: 33, height: 33 });
    expect(lineY(g, L.hookRow)).toBe(608);
    // toggle mirrors the logo: two cells in from the right
    expect(boxStyle(g, L.toggle)).toEqual({ left: 1344, top: 64, width: 33, height: 33 });
    // field + button centred in the window
    const win = boxStyle(g, L.window);
    const f = boxStyle(g, L.field);
    const b = boxStyle(g, L.button);
    expect(f.left - win.left).toBe(win.left + win.width - (b.left + b.width));
  });

  it("keeps the window centred and inside the grid", () => {
    for (const [w, h] of VIEWPORTS) {
      const g = computeGrid(w, h, 1, LANDING_MIN_ROWS);
      const L = landingLayout(g);
      expect(L.window.c0).toBeGreaterThanOrEqual(0);
      expect(L.window.c1).toBeLessThanOrEqual(g.N);
      expect(Math.abs(L.window.c0 - (g.N - L.window.c1))).toBeLessThanOrEqual(1);
      expect(L.window.r1).toBeLessThan(g.M);
    }
  });
});

describe("modelWindow", () => {
  it("is a square of the window's height, centred, on the same rows as the globe window", () => {
    const g = computeGrid(1440, 928);
    const win = landingLayout(g).window;
    const sq = modelWindow(g);
    expect(sq.c1 - sq.c0).toBe(win.r1 - win.r0);
    expect([sq.r0, sq.r1]).toEqual([win.r0, win.r1]);
    // equal margins left and right (within one cell)
    expect(Math.abs(sq.c0 - (g.N - sq.c1))).toBeLessThanOrEqual(1);
  });

  it("lerpBox lands on whole pixels and on both ends", () => {
    const a = { left: 0, top: 0, width: 10, height: 10 };
    const b = { left: 5, top: 3, width: 21, height: 10 };
    expect(lerpBox(a, b, 0)).toEqual(a);
    expect(lerpBox(a, b, 1)).toEqual(b);
    expect(Object.values(lerpBox(a, b, 0.37)).every(Number.isInteger)).toBe(true);
  });
});
