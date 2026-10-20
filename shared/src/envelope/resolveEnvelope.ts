import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";
import type { Constrained, Envelope, Provenance, SiteConstraints } from "../schemas/constraints";
import type { Ring } from "../schemas/site";
import { closeRing, openRing, polygonWithHolesArea, toCcw, toGeoPolygon } from "../geo/planar";
import { edgeRoles, type EdgeRole } from "./edges";
import { insetPerEdge } from "./inset";

/** Below this the clipped-off bouwvlak area is float noise, not worth a note. */
const AREA_EPS = 0.5;

const STATUS_RANK: Record<Provenance["status"], number> = { assumed: 0, extracted: 1, user_override: 2, verified: 3 };

const m2 = (a: number) => `${Math.round(a)} m²`;

const mpArea = (mp: MultiPolygon) => mp.reduce((s, p) => s + polygonWithHolesArea(p), 0);

/** A clipping operation, or null when polygon-clipping throws on the input (the caller notes it and falls back). */
function tryClip(op: () => MultiPolygon): MultiPolygon | null {
  try {
    return op();
  } catch {
    return null;
  }
}

/** Largest part of a clip result; notes when parts were dropped. */
function largestPart(mp: MultiPolygon, notes: string[]): Envelope["footprint"] {
  const sorted = [...mp].sort((a, b) => polygonWithHolesArea(b) - polygonWithHolesArea(a));
  if (sorted.length > 1) {
    notes.push(`The buildable area splits into ${sorted.length} parts; the largest (${m2(polygonWithHolesArea(sorted[0]!))}) is used.`);
  }
  return toGeoPolygon(sorted[0]!);
}

/** Provenance of a value derived from several inputs: the weakest status, all sources. */
function combinedProv(label: string, inputs: Constrained<unknown>[]): Provenance {
  const weakest = inputs.reduce((w, c) => (STATUS_RANK[c.prov.status] < STATUS_RANK[w] ? c.prov.status : w), "verified" as Provenance["status"]);
  const sources = [...new Set(inputs.map((c) => c.prov.source))];
  return { source: `${label}: ${sources.join("; ")}`, status: weakest };
}

/**
 * Buildable envelope (SPEC §5), resolved in order:
 * 1. bouwvlak clipped to the parcel, 2. parcel shrunk per edge by the setbacks, 3. the parcel itself (assumed).
 * All geometry in the same planar frame as `parcelRing`. Never invents a value: an unknown input
 * skips its step and says so in `notes`.
 */
export function resolveEnvelope(parcelRing: Ring, c: SiteConstraints): Envelope {
  const notes: string[] = [];
  const parcel = toCcw(openRing(parcelRing));
  const parcelGeom: Pair[][] = [closeRing(parcel)];
  const maxHeight = c.maxHeight.value;
  if (maxHeight === null) notes.push("Max building height is unknown, so the envelope has no height.");

  // 1. bouwvlak
  const bouwvlak = c.bouwvlak?.value;
  if (c.bouwvlak && bouwvlak && bouwvlak.coordinates.length) {
    const clipped = tryClip(() => polygonClipping.intersection(bouwvlak.coordinates as Pair[][], parcelGeom));
    if (clipped === null) {
      notes.push("The bouwvlak could not be clipped to the parcel (geometry error) and is ignored.");
    } else if (!clipped.length) {
      notes.push("The bouwvlak does not overlap the parcel and is ignored.");
    } else {
      const outside = polygonWithHolesArea(bouwvlak.coordinates) - mpArea(clipped);
      if (outside > AREA_EPS) notes.push(`The bouwvlak extends ${m2(outside)} past the parcel; clipped to the parcel.`);
      return { footprint: largestPart(clipped, notes), maxHeight, source: "bouwvlak", prov: c.bouwvlak.prov, notes };
    }
  }

  // 2. setbacks
  const { street, side, rear } = c.setbacks;
  const unknown = (["street", "side", "rear"] as const).filter((k) => c.setbacks[k].value === null);
  const allEqual = street.value === side.value && side.value === rear.value;
  const streetSide = c.streetSide;
  if (unknown.length) {
    notes.push(`Setbacks unknown (${unknown.join(", ")}), so the parcel itself is used.`);
  } else if (!allEqual && (streetSide?.value ?? null) === null) {
    notes.push("The street side is unknown, so street, side and rear edges cannot be told apart; the parcel itself is used.");
  } else {
    const d: Record<EdgeRole, number> = { street: street.value!, side: side.value!, rear: rear.value! };
    const roles: EdgeRole[] = allEqual ? parcel.map(() => "street") : edgeRoles(parcel, streetSide!.value!);
    const inputs = allEqual ? [street, side, rear] : [street, side, rear, streetSide!];
    const prov = combinedProv("Setbacks", inputs);
    const result = tryClip(() => insetPerEdge(parcel, roles.map((r) => d[r])));
    if (result === null) {
      notes.push("The setbacks could not be applied to this parcel's outline (geometry error), so the parcel itself is used.");
    } else if (!result.length) {
      notes.push("The setbacks leave no buildable area.");
      return { footprint: { type: "Polygon", coordinates: [] }, maxHeight, source: "setbacks", prov, notes };
    } else {
      return { footprint: largestPart(result, notes), maxHeight, source: "setbacks", prov, notes };
    }
  }

  // 3. parcel
  return {
    footprint: toGeoPolygon(parcelGeom),
    maxHeight,
    source: "parcel",
    prov: { source: "Kadaster parcel boundary (indicative); no bouwvlak or setbacks", status: "assumed" },
    notes,
  };
}
