import { describe, expect, it } from "vitest";
import type { Provenance, SiteConstraints } from "../schemas/constraints";
import type { Ring } from "../schemas/site";
import { centroid, distanceToSegment, openRing, pointInRing, polygonArea, polygonWithHolesArea, signedArea, toLocal } from "../geo/planar";
import { unknownConstraints } from "../constraints/overrides";
import { edgeRoles, outwardBearing } from "./edges";
import { insetPerEdge } from "./inset";
import { resolveEnvelope } from "./resolveEnvelope";

const assumed = { source: "test", status: "assumed" as const };
const verified = { source: "plan", status: "verified" as const };
const n = (value: number | null, prov: Provenance = assumed) => ({ value, unit: "m", prov });

/** 20 m wide (x), 30 m deep (y); the street is to the south (bearing 180°). */
const rect: Ring = [
  [0, 0],
  [20, 0],
  [20, 30],
  [0, 30],
];

function rules(over: Partial<SiteConstraints> = {}): SiteConstraints {
  return {
    ...unknownConstraints("test"),
    maxHeight: n(12),
    setbacks: { street: n(5), side: n(2), rear: n(8) },
    streetSide: { value: 180, unit: "°", prov: assumed },
    ...over,
  };
}

const outer = (fp: { coordinates: [number, number][][] }) => openRing(fp.coordinates[0]!);

/** Stand-in parcel DEL00 K 2410 (Kadaster, RD metres), shifted to its centroid. */
const k2410Rd: Ring = [
  [85632.754, 446613.317], [85616.681, 446606.55], [85619.006, 446601.019], [85621.283, 446601.978],
  [85620.866, 446602.968], [85623.396, 446604.043], [85624.249, 446602.016], [85626.78, 446603.093],
  [85626.351, 446604.112], [85635.085, 446607.788], [85635.984, 446608.167], [85633.657, 446613.697],
];
const k2410 = toLocal(k2410Rd, centroid(k2410Rd));

describe("edge roles", () => {
  it("measures outward bearings on a CCW ring", () => {
    expect(outwardBearing([0, 0], [20, 0])).toBeCloseTo(180); // bottom edge faces south
    expect(outwardBearing([20, 0], [20, 30])).toBeCloseTo(90); // right edge faces east
  });
  it("classifies a rotated rectangle", () => {
    const a = (30 * Math.PI) / 180;
    const rot = rect.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as [number, number]);
    // rotating CCW by 30° turns the south-facing edge to face bearing 150°
    expect(edgeRoles(rot, 150)).toEqual(["street", "side", "rear", "side"]);
  });
  it("treats jogs and bumps along a side boundary as side edges", () => {
    // stand-in parcel: long axis ENE, street at the ENE end; the south side has a jog and a bump
    const roles = edgeRoles(k2410, 65);
    expect(roles.filter((r) => r === "street")).toHaveLength(1);
    expect(roles.filter((r) => r === "rear")).toHaveLength(1);
  });
});

describe("insetPerEdge", () => {
  it("shrinks an L-shape and keeps the distance around the concave corner", () => {
    const L: Ring = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
    const d = 3;
    const result = insetPerEdge(L, L.map(() => d));
    expect(result).toHaveLength(1);
    const ring = openRing(result[0]![0]!);
    for (const p of ring) {
      for (let i = 0; i < L.length; i++) {
        expect(distanceToSegment(p, L[i]!, L[(i + 1) % L.length]!)).toBeGreaterThan(d - 1e-9);
      }
    }
    // the reflex corner (10, 10) is rounded off, not touched
    expect(Math.min(...ring.map((p) => Math.hypot(p[0] - 10, p[1] - 10)))).toBeGreaterThan(d - 1e-9);
  });
});

describe("resolveEnvelope", () => {
  it("1. bouwvlak inside the parcel is used as is", () => {
    const bouwvlak = { type: "Polygon" as const, coordinates: [[[2, 2], [18, 2], [18, 12], [2, 12], [2, 2]]] as [number, number][][] };
    const env = resolveEnvelope(rect, rules({ bouwvlak: { value: bouwvlak, prov: verified } }));
    expect(env.source).toBe("bouwvlak");
    expect(env.prov.status).toBe("verified");
    expect(polygonWithHolesArea(env.footprint.coordinates)).toBeCloseTo(160);
    expect(env.notes).toEqual([]);
  });

  it("1. bouwvlak past the parcel is clipped, with a note", () => {
    const bouwvlak = { type: "Polygon" as const, coordinates: [[[-5, 10], [25, 10], [25, 40], [-5, 40], [-5, 10]]] as [number, number][][] };
    const env = resolveEnvelope(rect, rules({ bouwvlak: { value: bouwvlak, prov: verified } }));
    expect(env.source).toBe("bouwvlak");
    expect(polygonWithHolesArea(env.footprint.coordinates)).toBeCloseTo(400); // 20 × 20 inside the parcel
    expect(env.notes.join(" ")).toMatch(/extends 500 m² past the parcel/);
    for (const p of outer(env.footprint)) expect(p[0] >= -1e-9 && p[0] <= 20 + 1e-9 && p[1] >= 10 - 1e-9 && p[1] <= 30 + 1e-9).toBe(true);
  });

  it("1. bouwvlak outside the parcel falls through to setbacks", () => {
    const bouwvlak = { type: "Polygon" as const, coordinates: [[[50, 50], [60, 50], [60, 60], [50, 50]]] as [number, number][][] };
    const env = resolveEnvelope(rect, rules({ bouwvlak: { value: bouwvlak, prov: verified } }));
    expect(env.source).toBe("setbacks");
    expect(env.notes[0]).toMatch(/does not overlap/);
  });

  it("2. setbacks shrink each edge by its own distance", () => {
    const env = resolveEnvelope(rect, rules());
    expect(env.source).toBe("setbacks");
    expect(env.maxHeight).toBe(12);
    expect(env.prov.status).toBe("assumed");
    const ring = outer(env.footprint);
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(2);
    expect(Math.max(...xs)).toBeCloseTo(18);
    expect(Math.min(...ys)).toBeCloseTo(5); // street, south
    expect(Math.max(...ys)).toBeCloseTo(22); // rear, north: 30 − 8
    expect(polygonWithHolesArea(env.footprint.coordinates)).toBeCloseTo(16 * 17);
    expect(signedArea(ring)).toBeGreaterThan(0);
  });

  it("2. takes the weakest status of its inputs", () => {
    const env = resolveEnvelope(rect, rules({ setbacks: { street: n(5, verified), side: n(2, verified), rear: n(8, verified) }, streetSide: { value: 180, prov: verified } }));
    expect(env.prov.status).toBe("verified");
  });

  it("2. equal setbacks do not need the street side", () => {
    const env = resolveEnvelope(rect, rules({ setbacks: { street: n(3), side: n(3), rear: n(3) }, streetSide: { value: null, prov: assumed } }));
    expect(env.source).toBe("setbacks");
    expect(polygonWithHolesArea(env.footprint.coordinates)).toBeCloseTo(14 * 24);
  });

  it("2. setbacks that consume the parcel leave an empty footprint and a note", () => {
    const env = resolveEnvelope(rect, rules({ setbacks: { street: n(20), side: n(2), rear: n(20) } }));
    expect(env.source).toBe("setbacks");
    expect(env.footprint.coordinates).toEqual([]);
    expect(env.notes).toContain("The setbacks leave no buildable area.");
  });

  it("3. an unknown setback falls back to the parcel, flagged assumed", () => {
    const env = resolveEnvelope(rect, rules({ setbacks: { street: n(5), side: n(null), rear: n(8) } }));
    expect(env.source).toBe("parcel");
    expect(env.prov.status).toBe("assumed");
    expect(env.notes.join(" ")).toMatch(/Setbacks unknown \(side\)/);
    expect(polygonWithHolesArea(env.footprint.coordinates)).toBeCloseTo(600);
  });

  it("3. unequal setbacks without a street side fall back to the parcel", () => {
    const env = resolveEnvelope(rect, rules({ streetSide: { value: null, prov: assumed } }));
    expect(env.source).toBe("parcel");
    expect(env.notes.join(" ")).toMatch(/street side is unknown/);
  });

  it("keeps an unknown max height as null", () => {
    const env = resolveEnvelope(rect, rules({ maxHeight: n(null) }));
    expect(env.maxHeight).toBeNull();
    expect(env.notes.join(" ")).toMatch(/height is unknown/);
  });

  it("works on the notched stand-in parcel DEL00 K 2410", () => {
    const env = resolveEnvelope(k2410, rules({ setbacks: { street: n(2), side: n(0), rear: n(5) }, streetSide: { value: 65, prov: assumed } }));
    expect(env.source).toBe("setbacks");
    expect(env.notes).toEqual([]); // one part, nothing clipped
    const area = polygonWithHolesArea(env.footprint.coordinates);
    expect(area).toBeGreaterThan(60);
    expect(area).toBeLessThan(polygonArea(k2410));
    // every footprint vertex lies inside (or on) the parcel
    const [cx, cy] = centroid(outer(env.footprint));
    expect(pointInRing([cx, cy], k2410)).toBe(true);
    for (const p of outer(env.footprint)) {
      const onEdge = k2410.some((a, i) => distanceToSegment(p, a, k2410[(i + 1) % k2410.length]!) < 1e-6);
      expect(onEdge || pointInRing(p, k2410)).toBe(true);
    }
  });

  it("keeps every point of the stand-in envelope at least its setback from each edge", () => {
    const setbacks = { street: 2, side: 0, rear: 9 };
    const env = resolveEnvelope(k2410, rules({ setbacks: { street: n(2), side: n(0), rear: n(9) }, streetSide: { value: 65, prov: assumed } }));
    const roles = edgeRoles(k2410, 65);
    expect(env.footprint.coordinates.length).toBeGreaterThan(0);
    for (const p of outer(env.footprint)) {
      k2410.forEach((a, i) => {
        expect(distanceToSegment(p, a, k2410[(i + 1) % k2410.length]!)).toBeGreaterThan(setbacks[roles[i]!] - 1e-6);
      });
    }
  });
});
