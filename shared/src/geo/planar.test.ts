import { describe, expect, it } from "vitest";
import { centroid, cleanRing, distanceToSegment, pointInRing, polygonArea, signedArea, toLocal } from "./planar";
import { wgs84ToRd } from "./crs";
import { sampleScene } from "../fixtures/sampleScene";

const rect = [
  [0, 0],
  [10, 0],
  [10, 4],
  [0, 4],
] as [number, number][];

describe("planar geometry", () => {
  it("computes area of a known rectangle", () => {
    expect(polygonArea(rect)).toBe(40);
  });
  it("signs area by winding", () => {
    expect(signedArea(rect)).toBe(40);
    expect(signedArea([...rect].reverse())).toBe(-40);
  });
  it("computes centroid", () => {
    expect(centroid(rect)).toEqual([5, 2]);
  });
  it("shifts to a local origin", () => {
    expect(toLocal(rect, [5, 2])[0]).toEqual([-5, -2]);
  });
  it("tests point in ring", () => {
    expect(pointInRing([5, 2], rect)).toBe(true);
    expect(pointInRing([11, 2], rect)).toBe(false);
    expect(pointInRing([5, -1], rect)).toBe(false);
  });
  it("cleans collinear and spike vertices", () => {
    const spiky: [number, number][] = [[0, 0], [5, 0], [10, 0], [10, 4], [12, 4], [10, 4], [0, 4], [0, 0]];
    expect(cleanRing(spiky)).toEqual([[0, 0], [10, 0], [10, 4], [0, 4]]);
  });
  it("measures distance to a segment", () => {
    expect(distanceToSegment([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distanceToSegment([13, 4], [0, 0], [10, 0])).toBe(5);
  });
  it("sample parcel is centred near the origin", () => {
    const [cx, cy] = centroid(sampleScene.parcel.ring);
    expect(Math.hypot(cx, cy)).toBeLessThan(3);
  });
});

describe("crs", () => {
  it("projects the Amersfoort reference point to the RD origin", () => {
    const [x, y] = wgs84ToRd(5.387201, 52.155172);
    expect(x).toBeCloseTo(155000, -1);
    expect(y).toBeCloseTo(463000, -1);
  });
});
