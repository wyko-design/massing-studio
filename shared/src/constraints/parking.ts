import { z } from "zod";
import type { Constrained, SiteConstraints } from "../schemas/constraints";

/**
 * A municipal parking policy read from the official register of local regulations (SPEC §4 data pipeline, extended).
 * The car-parking norm for housing depends on the dwelling size and on the parking zone the plot lies in, so the whole table
 * travels to the client, which looks the norm up from the programme's unit size and the chosen zone.
 */
export const ParkingZoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** "maximum": more spaces than the norm are not allowed, fewer are (city centre). "norm": the norm is both minimum and maximum. */
  basis: z.enum(["maximum", "norm"]),
});
export type ParkingZone = z.infer<typeof ParkingZoneSchema>;

export const ParkingRowSchema = z.object({
  /** The row as the policy words it, e.g. "Woning tussen 50 tot 75 m2 GO". */
  label: z.string(),
  /** "size": picked by the dwelling's floor area; "student" and "care" are listed for reference. */
  kind: z.enum(["size", "student", "care"]),
  /** Floor area band in m² GO, from (inclusive) to (exclusive); null = open. Only for kind "size". */
  fromM2: z.number().nullable(),
  toM2: z.number().nullable(),
  /** Spaces per dwelling, per zone id. */
  values: z.record(z.string(), z.object({ residents: z.number(), visitors: z.number() })),
});
export type ParkingRow = z.infer<typeof ParkingRowSchema>;

export const ParkingPolicySchema = z.object({
  municipality: z.string(),
  regulation: z.object({ title: z.string(), id: z.string(), date: z.string().nullable(), url: z.string() }),
  zones: z.array(ParkingZoneSchema),
  /** Empty when the table could not be read (other municipalities): the AI extraction can still read the text. */
  rows: z.array(ParkingRowSchema),
  /** A guess from the plan areas the plot lies in; the user can change it. Null when no guess is possible. */
  suggestedZone: z.object({ id: z.string(), reason: z.string() }).nullable(),
  /** Sentences from the policy that matter for housing, verbatim. */
  notes: z.array(z.string()),
  /** The regulation's text (XML) for the AI rule extraction. */
  textUrl: z.string(),
});
export type ParkingPolicy = z.infer<typeof ParkingPolicySchema>;

const round2 = (v: number) => Math.round(v * 100) / 100;
const nl = (v: number) => String(v).replace(".", ",");

export type ParkingNorm = { value: number; quote: string; zone: ParkingZone; row: ParkingRow; residents: number; visitors: number };

/** The row of the table that applies to a dwelling of `avgUnitM2` (floor area, m²). */
export function rowFor(policy: ParkingPolicy, avgUnitM2: number): ParkingRow | null {
  return policy.rows.find((r) => r.kind === "size" && (r.fromM2 ?? 0) <= avgUnitM2 && (r.toM2 === null || avgUnitM2 < r.toM2)) ?? null;
}

/** Spaces per dwelling (residents + visitors) for a zone and a dwelling size; null when the policy has no such row or zone. */
export function parkingNormFrom(policy: ParkingPolicy, zoneId: string, avgUnitM2: number): ParkingNorm | null {
  const zone = policy.zones.find((z) => z.id === zoneId);
  const row = rowFor(policy, avgUnitM2);
  const v = row?.values[zoneId];
  if (!zone || !row || !v) return null;
  const value = round2(v.residents + v.visitors);
  const quote = `${row.label}, ${zone.label}: ${nl(v.residents)} bewoners + ${nl(v.visitors)} bezoekers per woning${zone.basis === "maximum" ? " (maximum)" : ""}`;
  return { value, quote, zone, row, residents: v.residents, visitors: v.visitors };
}

/**
 * Fills `parkingNorm` from the policy when it is unknown or only assumed (never over an extracted, verified or user value).
 * `zoneChosen`: the user picked the zone → status `extracted`; a mere guess from the plan areas stays `assumed`.
 */
export function applyParking(c: SiteConstraints, policy: ParkingPolicy | undefined, zoneId: string | null, zoneChosen: boolean, avgUnitM2: number): SiteConstraints {
  if (!policy || !zoneId) return c;
  const current = c.parkingNorm;
  if (current && current.value !== null && current.prov.status !== "assumed") return c;
  const norm = parkingNormFrom(policy, zoneId, avgUnitM2);
  if (!norm) return c;
  const field: Constrained<number> = {
    value: norm.value,
    unit: "spaces/unit",
    prov: {
      source: `${policy.regulation.title} (${policy.regulation.id}), ${policy.regulation.url}${zoneChosen ? "" : "; zone is a guess from the plan areas"}`,
      quote: norm.quote,
      status: zoneChosen ? "extracted" : "assumed",
    },
  };
  return { ...c, parkingNorm: field };
}
