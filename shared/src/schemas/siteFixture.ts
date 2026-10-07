import { z } from "zod";
import { SiteConstraintsSchema } from "./constraints";

/** Raw plan text the constraints were (or will be) read from, so the AI and the UI can cite it. */
export const PlanExcerptSchema = z.object({
  title: z.string(),
  text: z.string(),
  url: z.string(),
});
export type PlanExcerpt = z.infer<typeof PlanExcerptSchema>;

/**
 * Hand-collected site file `data/sites/<id>.json` (SPEC §5). Geometry (bouwvlak, buildingLine)
 * is in RD New metres; the server shifts it to the local frame. See data/sites/README.md.
 */
export const SiteFixtureSchema = z.object({
  id: z.string(),
  address: z.string(),
  /** Kadaster parcel id as the ParcelProvider reports it, e.g. "DEL00 K 2410". */
  parcelId: z.string(),
  excerpts: z.array(PlanExcerptSchema),
  constraints: SiteConstraintsSchema,
});
export type SiteFixture = z.infer<typeof SiteFixtureSchema>;
