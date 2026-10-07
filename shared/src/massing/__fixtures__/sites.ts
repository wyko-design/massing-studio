import type { Envelope, Provenance, SiteConstraints } from "../../schemas/constraints";
import type { MassingParams } from "../../schemas/massing";
import type { Ring } from "../../schemas/site";
import { centroid, polygonArea, rotate, toGeoPolygon, toLocal } from "../../geo/planar";
import { unknownConstraints } from "../../constraints/overrides";
import { resolveEnvelope } from "../../envelope/resolveEnvelope";
import type { MassingSite } from "../generateMassing";

export const assumed: Provenance = { source: "test", status: "assumed" };
export const num = (value: number | null, unit?: string) => ({ value, ...(unit ? { unit } : {}), prov: assumed });

/** Residential, max height 15 m, street to the south, no coverage/FAR/gutter rule unless given. */
export function rules(over: Partial<SiteConstraints> = {}): SiteConstraints {
  return {
    ...unknownConstraints("test"),
    allowedFunctions: { value: ["Wonen"], prov: assumed },
    maxHeight: num(15, "m"),
    setbacks: { street: num(0, "m"), side: num(0, "m"), rear: num(0, "m") },
    streetSide: num(180, "°"),
    ...over,
  };
}

export const envelopeOf = (ring: Ring, maxHeight: number | null = 15): Envelope => ({
  footprint: toGeoPolygon([ring]),
  maxHeight,
  source: "setbacks",
  prov: assumed,
  notes: [],
});

export const params = (over: Partial<MassingParams> = {}): MassingParams => ({
  typology: "slab",
  floors: 4,
  groundFloorHeight: 3.5,
  floorHeight: 3,
  depth: 10,
  alignment: "street",
  coverageTarget: 0.5,
  roof: "flat",
  colour: "#c23350",
  ...over,
});

export const site = (parcelArea: number): MassingSite => ({
  parcelArea,
  programme: { targetUnits: 12, avgUnitSize: 60, netToGross: 0.75 },
});

export const rectRing = (w: number, h: number): Ring => [[0, 0], [w, 0], [w, h], [0, h]];
export const lRing: Ring = [[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]];
export const rotatedRect: Ring = rotate(rectRing(36, 24), (25 * Math.PI) / 180);

/** ~40-vertex wobbly envelope for the benchmark. */
export const wobbly: Ring = Array.from({ length: 40 }, (_, i) => {
  const a = (2 * Math.PI * i) / 40;
  const r = 30 + 6 * Math.sin(5 * a);
  return [r * Math.cos(a) * 1.4, r * Math.sin(a)] as [number, number];
});

/** Stand-in parcel DEL00 K 2410 (Kadaster, RD metres), shifted to its centroid. */
const k2410Rd: Ring = [
  [85632.754, 446613.317], [85616.681, 446606.55], [85619.006, 446601.019], [85621.283, 446601.978],
  [85620.866, 446602.968], [85623.396, 446604.043], [85624.249, 446602.016], [85626.78, 446603.093],
  [85626.351, 446604.112], [85635.085, 446607.788], [85635.984, 446608.167], [85633.657, 446613.697],
];
export const k2410 = toLocal(k2410Rd, centroid(k2410Rd));
export const k2410Area = polygonArea(k2410);
/** placeholder.json values: street 2 / side 0 / rear 5 m, street side 65°, coverage 0.6. */
export const k2410Rules = rules({
  setbacks: { street: num(2, "m"), side: num(0, "m"), rear: num(5, "m") },
  streetSide: num(65, "°"),
  maxCoverage: num(0.6),
});
export const k2410Envelope = resolveEnvelope(k2410, k2410Rules);
