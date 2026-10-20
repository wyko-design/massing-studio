import { z } from "zod";
import { SiteConstraintsSchema } from "./constraints";
import { VolumeSchema } from "./massing";
import { PlanTextRefSchema } from "./siteFixture";
import { ParkingPolicySchema } from "../constraints/parking";

/** Ring of [x, y] in metres. Local frame: origin at parcel centroid, x east, y north. */
export const RingSchema = z.array(z.tuple([z.number(), z.number()])).min(3);
export type Ring = z.infer<typeof RingSchema>;

export const ParcelSchema = z.object({
  id: z.string(),
  areaM2: z.number(),
  ring: RingSchema,
  /** Kadaster geometry is not legally measured. */
  indicative: z.literal(true),
});
export type Parcel = z.infer<typeof ParcelSchema>;

export const ContextBuildingSchema = z.object({
  id: z.string(),
  ring: RingSchema,
  height: z.number().positive(),
});
export type ContextBuilding = z.infer<typeof ContextBuildingSchema>;

export const SceneMetaSchema = z.object({
  /** Geocoder label of the requested address. */
  address: z.string(),
  sources: z.array(z.string()),
  contextCount: z.number().int().nonnegative(),
  /** Context buildings dropped because they had no usable height or footprint. */
  skippedContext: z.number().int().nonnegative(),
});
export type SceneMeta = z.infer<typeof SceneMetaSchema>;

export const SiteSceneSchema = z.object({
  /** WGS84 of the parcel centroid (the local origin). Drives suncalc. */
  origin: z.object({ lat: z.number(), lon: z.number() }),
  parcel: ParcelSchema,
  context: z.array(ContextBuildingSchema),
  /** Proposal volumes in local metres. M0: hard-coded test mass; M3: generateMassing output. */
  proposal: z.array(VolumeSchema).optional(),
  meta: SceneMetaSchema.optional(),
  /** Municipal parking policy for the plot, when one was found (the client picks the zone and looks the norm up). */
  parking: ParkingPolicySchema.optional(),
  /** Planning constraints in the local frame. `fixtureId: null` = no site fixture, every value unknown. */
  zoning: z
    .object({
      fixtureId: z.string().nullable(),
      /** Where the rules came from, in words. Absent for fixtures (the client names the file). */
      label: z.string().optional(),
      /** Plan articles behind the live values, for "Extract rules" (absent for fixtures). */
      textRefs: z.array(PlanTextRefSchema).optional(),
      constraints: SiteConstraintsSchema,
    })
    .optional(),
});
export type SiteScene = z.infer<typeof SiteSceneSchema>;
