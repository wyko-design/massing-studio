import { describe, expect, it } from "vitest";
import { ASPECTS, exportSize, fitFrame } from "./frame";

describe("frame", () => {
  it("keeps the aspect ratios", () => {
    expect(ASPECTS["4:5"].width / ASPECTS["4:5"].height).toBeCloseTo(0.8);
    expect(ASPECTS["1:1"].width).toBe(ASPECTS["1:1"].height);
    expect(ASPECTS.a3.width / ASPECTS.a3.height).toBeCloseTo(Math.SQRT2, 2);
  });
  it("multiplies the base size", () => {
    expect(exportSize("4:5", 1)).toEqual({ width: 960, height: 1200 });
    expect(exportSize("a3", 4)).toEqual({ width: 5656, height: 4000 });
  });
  it("fits a portrait frame into a landscape area, centred", () => {
    const f = fitFrame(1000, 600, { width: 960, height: 1200 });
    expect(f.k).toBeCloseTo(0.5);
    expect(f.top).toBeCloseTo(0);
    expect(f.left).toBeCloseTo((1000 - 480) / 2);
  });
  it("caps the scale", () => {
    expect(fitFrame(10000, 10000, { width: 1000, height: 1000 }, 1.5).k).toBe(1.5);
  });
});
