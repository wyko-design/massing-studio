import { describe, expect, it } from "vitest";
import { polygonArea } from "../geo/planar";
import { PRESET_IDS } from "../schemas/ai";
import { generateMassing } from "./generateMassing";
import { PRESETS, presetParams, presetWish } from "./presets";
import { envelopeOf, num, rectRing, rules, site } from "./__fixtures__/sites";

const ring = rectRing(40, 30);
const area = polygonArea(ring);
const fit = (c = rules(), maxHeight: number | null = 15) => {
  const envelope = envelopeOf(ring, maxHeight);
  return Object.fromEntries(PRESET_IDS.map((id) => [id, presetParams(id, envelope, c, site(area))])) as Record<(typeof PRESET_IDS)[number], ReturnType<typeof presetParams>>;
};

describe("presets", () => {
  it("are four different strategies, not one parameter apart", () => {
    const p = fit();
    const keys = ["typology", "alignment", "roof", "floors", "coverageTarget", "depth"] as const;
    for (const a of PRESET_IDS)
      for (const b of PRESET_IDS) {
        if (a >= b) continue;
        const differ = keys.filter((k) => p[a][k] !== p[b][k]);
        expect(differ.length, `${a} vs ${b}`).toBeGreaterThanOrEqual(2);
      }
  });

  it("fill the height limit when they ask for max floors", () => {
    const p = fit(); // 15 m: 3.5 + 3 × 3 = 12.5, a fifth floor would reach 15.5
    expect(p.homes.floors).toBe(4);
    expect(p.garden.floors).toBe(4);
    expect(p.low.floors).toBe(3);
  });

  it("start without clamps", () => {
    const c = rules({ maxCoverage: num(0.4) });
    const p = fit(c);
    expect(p.homes.coverageTarget).toBe(0.4);
    for (const id of PRESET_IDS) {
      const r = generateMassing(envelopeOf(ring), c, p[id], site(area));
      expect(r.clamps.filter((x) => x.startsWith("Asked for")), id).toEqual([]);
    }
  });

  it("ask for fewer floors when no height limit is known", () => {
    const c = rules({ maxHeight: num(null, "m") });
    expect(fit(c, null).homes.floors).toBe(6);
    expect(presetWish("garden").floors).toBe(6);
  });

  it("carry text without digits", () => {
    for (const id of PRESET_IDS) {
      const { name, intent, tradeOffs } = PRESETS[id];
      expect([name, intent, ...tradeOffs].join(" ")).not.toMatch(/\d/);
    }
  });
});
