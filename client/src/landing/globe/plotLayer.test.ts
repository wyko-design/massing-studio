import { describe, expect, it } from "vitest";
import { EARTH_R, insideParcel, localParcel, plotDots, plotLevel, plotScale, plotView, toLocal, type PlotData } from "./plotLayer";

/** A 20 × 10 m parcel with a 4 × 4 m hole, near Delft. */
const origin: [number, number] = [4.377, 52.0035];
const mLon = EARTH_R * (Math.PI / 180) * Math.cos((origin[1] * Math.PI) / 180);
const mLat = EARTH_R * (Math.PI / 180);
const at = (x: number, y: number): [number, number] => [origin[0] + x / mLon, origin[1] + y / mLat];
const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
const parcel = localParcel([[rect(-10, -5, 10, 5), rect(-2, -2, 2, 2)]], origin);

describe("plot lattice", () => {
  it("converts to local metres", () => {
    const [x, y] = toLocal(parcel.local, ...at(7, -3));
    expect(x).toBeCloseTo(7, 6);
    expect(y).toBeCloseTo(-3, 6);
    expect(parcel.bbox.x1 - parcel.bbox.x0).toBeCloseTo(20, 5);
  });

  it("treats holes as outside", () => {
    expect(insideParcel(parcel, 5, 0)).toBe(true);
    expect(insideParcel(parcel, 0, 0)).toBe(false);
    expect(insideParcel(parcel, 12, 0)).toBe(false);
  });

  it("only draws dots inside the parcel, none in the hole", () => {
    const { coarse } = plotDots(parcel, 0, false);
    expect(coarse.length).toBeGreaterThan(0);
    for (let k = 0; k < coarse.length; k += 2) expect(insideParcel(parcel, coarse[k]!, coarse[k + 1]!)).toBe(true);
  });

  it("level L + 1 only adds dots: coarse ∪ fine at L equals the whole lattice at L + 1", () => {
    for (const level of [-1, 0, 1, 2]) {
      const key = (a: number[]) => new Set(Array.from({ length: a.length / 2 }, (_, k) => `${a[2 * k]!.toFixed(6)},${a[2 * k + 1]!.toFixed(6)}`));
      const here = plotDots(parcel, level, true);
      const finer = plotDots(parcel, level + 1, false);
      const union = key([...here.coarse, ...here.fine]);
      expect(union).toEqual(key(finer.coarse));
      expect(key(here.fine).size + key(here.coarse).size).toBe(union.size); // no dot twice
    }
  });

  it("keeps the on-screen spacing between 4 and 8 px, the next level fading in at the end of each doubling", () => {
    for (const pxPerM of [0.37, 1, 3.3, 5.3, 40]) {
      const { level, fade } = plotLevel(pxPerM, 4);
      const spacingPx = pxPerM * Math.pow(2, -level);
      expect(spacingPx).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(spacingPx).toBeLessThan(8);
      expect(fade).toBeGreaterThanOrEqual(0);
      expect(fade).toBeLessThanOrEqual(1);
    }
    expect(plotLevel(4.4, 4).fade).toBe(0);
    expect(plotLevel(7.9, 4).fade).toBeGreaterThan(0.9);
  });
});

describe("plot view", () => {
  const data: PlotData = {
    id: "adr-x",
    label: "x",
    point: origin,
    parcel: { id: "p", areaM2: 80, polygons: [[rect(-10, -5, 10, 5)]] },
    frameM: 90,
    buildings: [],
  };

  it("spans frameM metres over the tighter axis, centred on the parcel", () => {
    const frame = { x: 0, y: 0, w: 478, h: 510 };
    const v = plotView(data, frame);
    expect(v.scale).toBeCloseTo(plotScale(frame, 90), 3);
    // 478 px for 90 m
    expect((v.scale / EARTH_R) * 90).toBeCloseTo(478, 3);
    expect(v.centre[0]).toBeCloseTo(origin[0], 7);
    expect(v.centre[1]).toBeCloseTo(origin[1], 7);
    expect(v.cx).toBe(239);
    expect(v.cy).toBe(255);
  });

  it("falls back to the address point without a parcel", () => {
    expect(plotView({ ...data, parcel: null }, { x: 0, y: 0, w: 400, h: 400 }).centre).toEqual(origin);
  });
});
