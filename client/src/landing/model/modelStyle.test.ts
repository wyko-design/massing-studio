import { describe, expect, it } from "vitest";
import { contextRadius, modelStyle, viewLimits } from "./modelStyle";

describe("contextRadius / viewLimits", () => {
  it("asks for more surroundings for bigger plots, within the server's cap", () => {
    expect(contextRadius(90)).toBe(198);
    expect(contextRadius(30)).toBe(modelStyle.context.minM);
    // a large plot: the end view plus some room, not 2.2 frames
    expect(contextRadius(600)).toBe(1020);
    expect(contextRadius(5000)).toBe(modelStyle.context.maxM);
  });

  it("never lets the window reach the end of the data: furthest zoom-out, steepest tilt, furthest pan", () => {
    for (const frameM of [90, 150, 300, 600, 1300, 3000]) {
      const r = contextRadius(frameM);
      const { endZoom, minZoom, maxZoom, panM } = viewLimits(607, 607, frameM, r);
      const halfDiag = 0.5 * Math.hypot(607 / minZoom, 607 / minZoom / Math.cos((modelStyle.orbit.maxPolarDeg * Math.PI) / 180));
      expect(halfDiag + panM).toBeLessThanOrEqual(0.95 * r + 1e-6);
      expect(minZoom).toBeLessThanOrEqual(endZoom);
      expect(maxZoom).toBeGreaterThan(endZoom);
    }
  });

  it("keeps the whole plot in the end view up to the server's cap, still with some room to look around", () => {
    for (const frameM of [300, 600, 1300]) {
      const { endZoom, minZoom, panM } = viewLimits(607, 607, frameM, contextRadius(frameM));
      expect(607 / endZoom).toBeCloseTo(frameM * modelStyle.camera.viewFrames, 6);
      expect(minZoom).toBeLessThan(endZoom);
      expect(panM).toBeGreaterThan(0);
    }
  });

  it("shows about 1.15 plot frames across at the end for a small plot", () => {
    expect(607 / viewLimits(607, 607, 90, contextRadius(90)).endZoom).toBeCloseTo(90 * 1.15, 0);
  });
});
