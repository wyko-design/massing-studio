import type { Envelope, SiteConstraints } from "../schemas/constraints";
import type { Programme } from "../schemas/massing";
import type { Ring } from "../schemas/site";
import { openRing, polygonWithHolesArea } from "../geo/planar";
import { axisAngle, buildFrame } from "./frame";

/** Reference storey heights for the floors-allowed fact (the generator uses each option's own). */
export const REF_GROUND_FLOOR = 3.5;
export const REF_FLOOR = 3;

export type FrameSize = { length: number; depth: number };

/** Computed facts about the envelope and programme. Code-made numbers for the AI prompts. */
export type EnvelopeFacts = {
  source: Envelope["source"];
  /** m² of buildable footprint (0 when the rules leave nothing). */
  area: number;
  parcelArea: number;
  maxHeight: number | null;
  /** Flat-roof floors within max height at the reference storey heights; null when height is unknown. */
  floorsAllowed: number | null;
  /** Max footprint the coverage rule allows, m²; null when unknown. */
  maxFootprintByCoverage: number | null;
  /** Envelope extent along (length) and across (depth) the building axis for each alignment. */
  street: FrameSize | null;
  sun: FrameSize | null;
  /** GFA the programme needs: units × unit size ÷ net-to-gross. */
  programmeGfa: number;
  notes: string[];
};

function frameSize(rings: Ring[], rules: SiteConstraints, alignment: "street" | "sun"): FrameSize | null {
  const outer = openRing(rings[0]!);
  const frame = buildFrame([outer, ...rings.slice(1).map(openRing)], axisAngle(outer, rules, alignment, []));
  return frame ? { length: frame.box.u1 - frame.box.u0, depth: frame.box.v1 - frame.box.v0 } : null;
}

export function envelopeFacts(envelope: Envelope, rules: SiteConstraints, parcelArea: number, programme: Programme): EnvelopeFacts {
  const rings = envelope.footprint.coordinates as Ring[];
  const empty = rings.length === 0 || (rings[0]?.length ?? 0) < 3;
  const h = envelope.maxHeight;
  const cov = rules.maxCoverage?.value ?? null;
  return {
    source: envelope.source,
    area: empty ? 0 : polygonWithHolesArea(rings),
    parcelArea,
    maxHeight: h,
    floorsAllowed: h === null ? null : h < REF_GROUND_FLOOR ? 0 : Math.floor((h - REF_GROUND_FLOOR) / REF_FLOOR + 1e-9) + 1,
    maxFootprintByCoverage: cov === null ? null : cov * parcelArea,
    street: empty ? null : frameSize(rings, rules, "street"),
    sun: empty ? null : frameSize(rings, rules, "sun"),
    programmeGfa: (programme.targetUnits * programme.avgUnitSize) / programme.netToGross,
    notes: envelope.notes,
  };
}
