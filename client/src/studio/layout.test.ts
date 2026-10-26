import { describe, expect, it } from "vitest";
import { computeGrid, modelWindow } from "../landing/grid";
import { STUDIO, STUDIO_MIN_ROWS, studioLayout } from "./layout";

const width = (c: { c0: number; c1: number }) => c.c1 - c.c0;
const height = (c: { r0: number; r1: number }) => c.r1 - c.r0;

describe("studioLayout", () => {
  it("lays the viewer and the panel side by side, one cell apart, centred, at the reference size", () => {
    const g = computeGrid(1440, 928);
    const l = studioLayout(g);
    expect(width(l.panel)).toBe(STUDIO.panelCols);
    expect(l.panel.c0 - l.viewer.c1).toBe(STUDIO.gap);
    expect(l.viewer.r0).toBe(l.panel.r0);
    expect(l.viewer.r1).toBe(l.panel.r1);
    const left = l.viewer.c0;
    const right = g.N - l.panel.c1;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    // taller than the landing's windows when there is room, with two free rows below
    expect(height(l.viewer)).toBeGreaterThan(19);
    expect(g.M - l.viewer.r1).toBeGreaterThanOrEqual(STUDIO.bottomCells);
  });

  it("puts the bands in the last rows of both windows, the canvas above the viewer band", () => {
    const l = studioLayout(computeGrid(1440, 928));
    expect(l.viewerBand.r1).toBe(l.viewer.r1);
    expect(height(l.viewerBand)).toBe(STUDIO.bandRows);
    expect(l.canvas.r1).toBe(l.viewerBand.r0);
    expect(l.panelBand).toEqual({ c0: l.panel.c0, c1: l.panel.c1, r0: l.panel.r1 - STUDIO.bandRows, r1: l.panel.r1 });
  });

  it("never goes below the landing window's height and keeps clear of the logo", () => {
    const g = computeGrid(1280, 600, 1, STUDIO_MIN_ROWS);
    const l = studioLayout(g);
    expect(height(l.viewer)).toBe(STUDIO.minRows);
    expect(l.viewer.r0).toBeGreaterThan(l.logo.r1);
  });

  it("caps the height and the viewer's width on big screens", () => {
    const l = studioLayout(computeGrid(2560, 1440));
    expect(height(l.viewer)).toBe(STUDIO.maxRows);
    expect(width(l.viewer)).toBe(STUDIO.maxRows + 12);
  });

  it("starts from the landing's model window: the viewer is at least as big", () => {
    const g = computeGrid(1440, 928);
    const m = modelWindow(g);
    const l = studioLayout(g);
    expect(height(l.viewer)).toBeGreaterThanOrEqual(height(m));
    expect(width(l.viewer)).toBeGreaterThanOrEqual(width(m));
  });
});
