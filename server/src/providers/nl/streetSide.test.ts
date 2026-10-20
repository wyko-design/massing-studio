import { describe, expect, it } from "vitest";
import type { Parcel } from "@massing/shared";
import { MAX_PARCEL_AREA_M2, bearing, boundaryPoints, nearestRoad, streetSideFor } from "./streetSide";

const square = (x: number, y: number, size: number): [number, number][] => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const parcelAt = (ring: [number, number][], areaM2 = 100): Parcel => ({ id: "T 1", areaM2, ring, indicative: true });
const road = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

/** A fetcher that answers every BGT road request with the given polygons (RD). */
const bgt = (...polys: number[][][][]) => async () => ({ features: polys.map((coordinates) => ({ geometry: { type: "Polygon", coordinates } })) });

describe("geometry", () => {
  it("gives compass bearings clockwise from north", () => {
    expect(bearing([0, 0], [0, 5])).toBe(0);
    expect(bearing([0, 0], [5, 0])).toBe(90);
    expect(bearing([0, 0], [0, -5])).toBe(180);
    expect(Math.round(bearing([0, 0], [-5, 0]))).toBe(270);
  });

  it("samples a ring at most every half metre", () => {
    const pts = boundaryPoints(square(0, 0, 10));
    expect(pts.length).toBeGreaterThanOrEqual(80);
    expect(pts[0]).toEqual([0, 0]);
  });

  it("finds the closest pair between a parcel and a road", () => {
    const hit = nearestRoad(square(0, 0, 10), [road(-50, 14, 60, 20)])!;
    expect(hit.distanceM).toBeCloseTo(4, 5);
    expect(hit.to[1]).toBeCloseTo(14, 5);
    expect(nearestRoad(square(0, 0, 10), [])).toBeNull();
  });
});

describe("streetSideFor", () => {
  it("points from the plot to the nearest carriageway", async () => {
    expect(await streetSideFor(bgt(road(-50, 14, 60, 20)), parcelAt(square(0, 0, 10)))).toEqual({ bearing: 0, distanceM: 4 });
    expect(await streetSideFor(bgt(road(14, -50, 20, 60)), parcelAt(square(0, 0, 10)))).toEqual({ bearing: 90, distanceM: 4 });
  });

  it("takes the nearer street on a corner plot", async () => {
    const r = await streetSideFor(bgt(road(-50, 12, 60, 18), road(11, -50, 17, 60)), parcelAt(square(0, 0, 10)));
    expect(r).toEqual({ bearing: 90, distanceM: 1 });
  });

  it("gives nothing when the road is too far, there is no road, or the parcel is a whole block", async () => {
    expect(await streetSideFor(bgt(road(-50, 80, 60, 90)), parcelAt(square(0, 0, 10)))).toBeNull();
    expect(await streetSideFor(bgt(), parcelAt(square(0, 0, 10)))).toBeNull();
    expect(await streetSideFor(bgt(road(-50, 14, 60, 20)), parcelAt(square(0, 0, 10), MAX_PARCEL_AREA_M2 + 1))).toBeNull();
  });
});
