import type { SiteConstraints } from "../schemas/constraints";
import { toLocal } from "../geo/planar";

/** Shift the geometric constraints (bouwvlak, building line) from RD metres to the local frame. */
export function constraintsToLocal(c: SiteConstraints, origin: [number, number]): SiteConstraints {
  const out = { ...c };
  const bouwvlak = c.bouwvlak?.value;
  if (c.bouwvlak && bouwvlak) {
    out.bouwvlak = { ...c.bouwvlak, value: { ...bouwvlak, coordinates: bouwvlak.coordinates.map((r) => toLocal(r, origin)) } };
  }
  const line = c.buildingLine?.value;
  if (c.buildingLine && line) {
    out.buildingLine = { ...c.buildingLine, value: { ...line, coordinates: toLocal(line.coordinates, origin) } };
  }
  return out;
}
