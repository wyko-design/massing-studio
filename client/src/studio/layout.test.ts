import { describe, expect, it } from "vitest";
import { EDGE_CELLS, LAYOUT, SQUARE, computeGrid, landingLayout, modelWindow } from "../landing/grid";
import { STUDIO, studioLayout } from "./layout";

const width = (c: { c0: number; c1: number }) => c.c1 - c.c0;
const height = (c: { r0: number; r1: number }) => c.r1 - c.r0;

describe("studioLayout", () => {
  it("keeps the landing's square at the reference size, with a panel at each side", () => {
    const g = computeGrid(1440, 928);
    const l = studioLayout(g);
    expect(l.square).toEqual(modelWindow(g));
    expect(width(l.square)).toBe(LAYOUT.windowRows);
    expect(height(l.square)).toBe(LAYOUT.windowRows);
    expect(l.square.c0 - l.left.panel.c1).toBe(SQUARE.gap);
    expect(l.right.panel.c0 - l.square.c1).toBe(SQUARE.gap);
    expect(width(l.left.panel)).toBeGreaterThanOrEqual(SQUARE.panelMin);
    expect(width(l.right.panel)).toBeGreaterThanOrEqual(SQUARE.panelMin);
    expect(l.left.panel.c0).toBeGreaterThanOrEqual(EDGE_CELLS);
    expect(l.right.panel.c1).toBeLessThanOrEqual(g.N - EDGE_CELLS);
    for (const p of [l.left, l.right]) {
      expect([p.panel.r0, p.panel.r1]).toEqual([l.square.r0, l.square.r1]);
      expect(p.band).toEqual({ c0: p.panel.c0, c1: p.panel.c1, r0: p.panel.r1 - STUDIO.bandRows, r1: p.panel.r1 });
    }
  });

  it("is on the globe window's rows at the reference size", () => {
    const g = computeGrid(1440, 928);
    const win = landingLayout(g).window;
    expect([studioLayout(g).square.r0, studioLayout(g).square.r1]).toEqual([win.r0, win.r1]);
  });

  it("grows the square on a big page while both panels keep their full width", () => {
    const g = computeGrid(1920, 1080);
    const l = studioLayout(g);
    expect(height(l.square)).toBeGreaterThan(LAYOUT.windowRows);
    expect(height(l.square)).toBeLessThanOrEqual(SQUARE.maxSide);
    expect(width(l.left.panel)).toBe(SQUARE.panelMax);
    expect(width(l.right.panel)).toBe(SQUARE.panelMax);
  });

  it("shrinks the square on a narrow page so the panels keep their minimum width, clear of the logo", () => {
    const g = computeGrid(1280, 800, 1, 28);
    const l = studioLayout(g);
    expect(height(l.square)).toBeLessThan(LAYOUT.windowRows);
    expect(width(l.left.panel)).toBeGreaterThanOrEqual(SQUARE.panelMin);
    expect(width(l.right.panel)).toBeGreaterThanOrEqual(SQUARE.panelMin);
    expect(l.square.r0).toBeGreaterThan(l.logo.r1);
  });

  it("moves the square left on the rules screen, the rules window one cell to its right, centred together", () => {
    const g = computeGrid(1440, 928);
    const l = studioLayout(g);
    expect(width(l.rulesSquare)).toBe(width(l.square));
    expect(l.rules.panel.c0 - l.rulesSquare.c1).toBe(SQUARE.gap);
    expect(width(l.rules.panel)).toBe(STUDIO.rulesCols);
    expect(Math.abs(l.rulesSquare.c0 - (g.N - l.rules.panel.c1))).toBeLessThanOrEqual(1);
  });
});
