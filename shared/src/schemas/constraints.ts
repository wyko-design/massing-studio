import { z } from "zod";

export const ProvenanceSchema = z.object({
  source: z.string(),
  quote: z.string().optional(),
  status: z.enum(["verified", "extracted", "assumed", "user_override"]),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** A planning value plus where it came from. `value: null` means unknown, never a silent default. */
export const constrained = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    unit: z.string().optional(),
    prov: ProvenanceSchema,
  });
export type Constrained<T> = {
  value: T | null;
  unit?: string | undefined;
  prov: Provenance;
};

export const PolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});
export const LineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});

const num = constrained(z.number());

export const SiteConstraintsSchema = z.object({
  allowedFunctions: constrained(z.array(z.string())),
  bouwvlak: constrained(PolygonSchema).optional(),
  maxHeight: num,
  maxGutterHeight: num.optional(),
  buildingLine: constrained(LineStringSchema).optional(),
  setbacks: z.object({ street: num, side: num, rear: num }),
  maxCoverage: num.optional(),
  maxFAR: num.optional(),
  parkingNorm: num.optional(),
  /**
   * Compass bearing (degrees clockwise from north) from the parcel towards the street.
   * Classifies parcel edges as street / side / rear for per-edge setbacks.
   */
  streetSide: num.optional(),
  notes: z.array(constrained(z.string())),
});
export type SiteConstraints = z.infer<typeof SiteConstraintsSchema>;

export const EnvelopeSchema = z.object({
  /** Closed CCW outer ring (+ holes). `coordinates: []` when the rules leave no buildable area. */
  footprint: PolygonSchema,
  /** Metres; null = unknown (never a silent default). */
  maxHeight: z.number().nullable(),
  source: z.enum(["bouwvlak", "setbacks", "parcel"]),
  prov: ProvenanceSchema,
  /** Why the footprint looks the way it does: clipping, fallbacks, unknown inputs. */
  notes: z.array(z.string()),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;
