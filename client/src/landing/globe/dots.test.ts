import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildCountries, type WorldTopology } from "../countries";
import { buildCountryIndex } from "./countryIndex";
import { forEachDot, type LatticeDot, type LatticeSpec } from "./lattice";

const require = createRequire(import.meta.url);
const topology = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8")) as WorldTopology;
const { shapes } = buildCountries(topology);
const index = buildCountryIndex(shapes.values());
const at = (lon: number, lat: number) => {
  const c = index.lookup(lon, lat);
  return c < 0 ? null : index.ids[c];
};

describe("country index", () => {
  it("finds countries and water", () => {
    expect(at(4.9, 52.37)).toBe("528"); // Amsterdam
    expect(at(2.35, 48.86)).toBe("250"); // Paris
    expect(at(-77, 40)).toBe("840"); // Pennsylvania
    expect(at(21, 52.2)).toBe("616"); // Warsaw
    expect(at(3, 54)).toBeNull(); // North Sea
    expect(at(-30, 0)).toBeNull(); // Atlantic
    expect(at(51, 42)).toBeNull(); // Caspian Sea
  });

  it("handles rings across the antimeridian and around the pole", () => {
    expect(at(177, 67)).toBe("643"); // Chukotka, west of 180°
    expect(at(-175, 66.5)).toBe("643"); // Chukotka, east of 180°
    expect(at(100, 65)).toBe("643"); // Siberia, same latitude band
    expect(at(0, -85)).toBe("010"); // Antarctica
    expect(at(179, -86)).toBe("010");
    expect(at(-179, -86)).toBe("010");
    expect(at(0, -60)).toBeNull(); // Southern Ocean
  });

  it("keeps France's overseas parts in France", () => {
    expect(at(-53, 4)).toBe("250"); // French Guiana
  });
});

describe("lattice", () => {
  const collect = (spec: LatticeSpec, level: number, centre: [number, number] = [0, 0], radius = 180) => {
    const dots: LatticeDot[] = [];
    forEachDot(spec, level, centre, radius, (d) => dots.push(d));
    return dots;
  };

  for (const mode of ["even", "latlon"] as const) {
    const spec: LatticeSpec = { mode, baseDeg: 180 / 69 };

    it(`${mode}: every dot of a level reappears at the same place one level finer`, () => {
      const coarse = collect(spec, 1);
      const fine = new Map(collect(spec, 2).map((d) => [d.key, d]));
      for (const d of coarse) {
        const f = fine.get(d.key);
        expect(f, `key ${d.key}`).toBeDefined();
        expect(f!.lon).toBeCloseTo(d.lon, 9);
        expect(f!.lat).toBeCloseTo(d.lat, 9);
      }
      // dots new at level 2 are exactly the ones not in level 1
      const coarseKeys = new Set(coarse.map((d) => d.key));
      for (const f of fine.values()) expect(f.level === 2).toBe(!coarseKeys.has(f.key));
    });

    it(`${mode}: keys are unique`, () => {
      const dots = collect(spec, 2);
      expect(new Set(dots.map((d) => d.key)).size).toBe(dots.length);
    });

    it(`${mode}: a cap only returns dots inside it`, () => {
      const centre: [number, number] = [5, 52];
      const radius = 10;
      const dots = collect(spec, 3, centre, radius);
      expect(dots.length).toBeGreaterThan(50);
      const RAD = Math.PI / 180;
      for (const d of dots) {
        const cos =
          Math.sin(d.lat * RAD) * Math.sin(centre[1] * RAD) +
          Math.cos(d.lat * RAD) * Math.cos(centre[1] * RAD) * Math.cos((d.lon - centre[0]) * RAD);
        expect(Math.acos(Math.min(1, cos)) / RAD).toBeLessThanOrEqual(radius + 1e-6);
      }
    });
  }

  it("keys stay unique at level 13 (city zoom), keeping their canonical level", () => {
    const spec: LatticeSpec = { mode: "even", baseDeg: 180 / 138 };
    const dots = collect(spec, 13, [5, 52], 0.01);
    expect(dots.length).toBeGreaterThan(20);
    expect(new Set(dots.map((d) => d.key)).size).toBe(dots.length);
    // the dots a coarser level already has keep their key and level
    const coarse = collect(spec, 12, [5, 52], 0.01);
    const fine = new Map(dots.map((d) => [d.key, d]));
    for (const d of coarse) expect(fine.get(d.key)?.lon).toBeCloseTo(d.lon, 9);
  });

  it("even: neighbouring dots in a row are about one row step apart on the ground", () => {
    const spec: LatticeSpec = { mode: "even", baseDeg: 180 / 69 };
    for (const lat of [0, 45, 70]) {
      const all = collect(spec, 0);
      const rowLat = all.reduce((best, d) => (Math.abs(d.lat - lat) < Math.abs(best - lat) ? d.lat : best), 999);
      const row = all.filter((d) => d.lat === rowLat);
      const lons = [...new Set(row.map((d) => d.lon))].sort((a, b) => a - b);
      const ground = (lons[1]! - lons[0]!) * Math.cos(row[0]!.lat * (Math.PI / 180));
      expect(ground / spec.baseDeg).toBeGreaterThan(0.9);
      expect(ground / spec.baseDeg).toBeLessThan(1.1);
    }
  });
});
