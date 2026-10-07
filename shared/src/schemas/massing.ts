import { z } from "zod";
import { PolygonSchema } from "./constraints";

export const TypologySchema = z.enum(["slab", "l_block", "courtyard", "tower_podium", "stepped"]);
export type Typology = z.infer<typeof TypologySchema>;

export const MassingParamsSchema = z.object({
  typology: TypologySchema,
  floors: z.number().int().positive(),
  groundFloorHeight: z.number().positive(),
  floorHeight: z.number().positive(),
  depth: z.number().positive(),
  alignment: z.enum(["street", "sun"]),
  coverageTarget: z.number().min(0).max(1),
  stepDirection: z.enum(["north", "south", "street", "rear"]).optional(),
  roof: z.enum(["flat", "pitched"]),
  colour: z.string(),
});
export type MassingParams = z.infer<typeof MassingParamsSchema>;

/** Programme assumptions. Design inputs the user edits, not planning rules. */
export const ProgrammeSchema = z.object({
  targetUnits: z.number().int().positive(),
  /** m² net per apartment */
  avgUnitSize: z.number().positive(),
  /** net (lettable) floor area ÷ GFA, 0–1 */
  netToGross: z.number().gt(0).max(1),
});
export type Programme = z.infer<typeof ProgrammeSchema>;

/** Starting values for the programme inputs. Assumptions, shown as such; the user edits them. */
export const DEFAULT_PROGRAMME: Programme = { targetUnits: 12, avgUnitSize: 65, netToGross: 0.75 };

/** Gable roof on top of a volume. The ridge runs along `ridgeAngle` (radians from +x, local frame). */
export const RoofSchema = z.object({
  pitchDeg: z.number(),
  ridgeAngle: z.number(),
  ridgeHeight: z.number().nonnegative(),
});
export type Roof = z.infer<typeof RoofSchema>;

/** An extruded polygon: footprint from zBase up to zBase + height (metres). */
export const VolumeSchema = z.object({
  footprint: PolygonSchema,
  zBase: z.number(),
  /** Wall height; a pitched roof adds `roof.ridgeHeight` on top. */
  height: z.number(),
  floors: z.number().int().nonnegative().optional(),
  roof: RoofSchema.optional(),
});
export type Volume = z.infer<typeof VolumeSchema>;

export const ComplianceSchema = z.object({
  rule: z.string(),
  status: z.enum(["pass", "fail", "unknown"]),
  detail: z.string(),
});
export type Compliance = z.infer<typeof ComplianceSchema>;

export const MassingResultSchema = z.object({
  volumes: z.array(VolumeSchema),
  metrics: z.object({
    footprint: z.number(),
    gfa: z.number(),
    far: z.number(),
    coverage: z.number(),
    height: z.number(),
    floors: z.number(),
    estUnits: z.number(),
    facadeSunScore: z.number(),
  }),
  compliance: z.array(ComplianceSchema),
  /** Every place the result differs from what the params asked for. */
  clamps: z.array(z.string()),
  /** Inputs taken as given and simplifications the numbers rest on. */
  assumptions: z.array(z.string()),
});
export type MassingResult = z.infer<typeof MassingResultSchema>;
export type MassingMetrics = MassingResult["metrics"];
