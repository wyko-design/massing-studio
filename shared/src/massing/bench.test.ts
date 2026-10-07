/// <reference types="node" />
import { describe, expect, it } from "vitest";
import type { Envelope, SiteConstraints } from "../schemas/constraints";
import type { Typology } from "../schemas/massing";
import { polygonArea } from "../geo/planar";
import { generateMassing } from "./generateMassing";
import { envelopeOf, k2410Area, k2410Envelope, k2410Rules, num, params, rules, site, wobbly } from "./__fixtures__/sites";

/** SPEC §8: fast enough for every slider change. */
const BUDGET_MS = 50;
const RUNS = 20;

const sites: [string, Envelope, SiteConstraints, number][] = [
  ["K 2410", k2410Envelope, k2410Rules, k2410Area],
  ["wobbly 40-gon", envelopeOf(wobbly), rules({ streetSide: num(200, "°"), maxCoverage: num(0.6) }), polygonArea(wobbly) * 1.3],
];

describe("generateMassing benchmark", () => {
  for (const [name, env, c, area] of sites) {
    for (const typology of ["slab", "l_block", "courtyard"] as Typology[]) {
      for (const alignment of ["street", "sun"] as const) {
        it(`${name}, ${typology}, ${alignment}: mean < ${BUDGET_MS} ms`, () => {
          const p = params({ typology, alignment, coverageTarget: 0.5, roof: "pitched" });
          generateMassing(env, c, p, site(area)); // warm-up
          const t0 = performance.now();
          for (let i = 0; i < RUNS; i++) generateMassing(env, c, { ...p, floors: 2 + (i % 5) }, site(area));
          const mean = (performance.now() - t0) / RUNS;
          console.log(`[bench] ${name} ${typology} ${alignment}: ${mean.toFixed(2)} ms`);
          expect(mean).toBeLessThan(BUDGET_MS);
        });
      }
    }
  }
});
