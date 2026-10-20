import { describe, expect, it } from "vitest";
import type { MultiPolygon, Position } from "geojson";
import { cityTiles, countryTiles, landOnly, mergeWater } from "./tileGeometry";
import { cityTilesAsync, countryTilesAsync } from "./tileJobs";

const square = (x: number, y: number, s: number): Position[][] => [
  [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
    [x, y],
  ],
];
const area = (polys: Position[][][]) =>
  polys.reduce((sum, rings) => {
    const r = rings[0]!;
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0]! - r[i]![0]!) * (r[j]![1]! + r[i]![1]!);
    return sum + Math.abs(a / 2);
  }, 0);

// 1 px = 0.001°: the squares are hundreds of px, well above the size filters
const pxDeg = 0.001;

describe("tile geometry", () => {
  it("merges overlapping water bodies into one", () => {
    const merged = mergeWater([square(0, 0, 1), square(0.5, 0, 1)], pxDeg);
    expect(merged).toHaveLength(1);
    expect(area(merged)).toBeCloseTo(1.5, 3);
  });

  it("cuts the water out of a city", () => {
    const city: MultiPolygon = { type: "MultiPolygon", coordinates: [square(0, 0, 2)] };
    const land = landOnly(city, [square(1, 0, 1)], pxDeg);
    expect(area(land.coordinates)).toBeCloseTo(3, 3);
  });

  it("keeps the country's water outside its outline only", () => {
    const country: MultiPolygon = { type: "MultiPolygon", coordinates: [square(0, 0, 2)] };
    const { water } = countryTiles(country, [square(1.5, 0, 2)], pxDeg);
    expect(area(water)).toBeCloseTo(3, 3); // the 4 deg² body minus its 1 deg² overlap with the country
  });

  it("gives the same answer without a worker (tests, old browsers)", async () => {
    const geometry: MultiPolygon = { type: "MultiPolygon", coordinates: [square(0, 0, 2)] };
    const water = [square(1, 0, 1), square(1.5, 0.5, 1)];
    expect(await cityTilesAsync(geometry, water, pxDeg)).toEqual(cityTiles(geometry, water, pxDeg));
    expect(await countryTilesAsync(geometry, water, pxDeg)).toEqual(countryTiles(geometry, water, pxDeg));
  });
});
