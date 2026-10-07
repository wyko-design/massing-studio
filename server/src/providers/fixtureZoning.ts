import { readFile } from "node:fs/promises";
import path from "node:path";
import { SiteFixtureSchema, type Parcel, type SiteFixture, type ZoningProvider, type ZoningResult } from "@massing/shared";

/** Read and validate `<sitesRoot>/<siteId>.json`. Null when the file does not exist; throws when it is invalid. */
export async function loadSiteFixture(sitesRoot: string, siteId: string): Promise<SiteFixture | null> {
  const file = path.join(sitesRoot, `${siteId}.json`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  const parsed = SiteFixtureSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`Invalid site fixture ${file}: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Zoning from a hand-collected site fixture (SPEC §5). Jurisdiction-agnostic: it only matches the
 * parcel id. A live provider (e.g. the DSO APIs) would implement the same interface.
 */
export class FixtureZoningProvider implements ZoningProvider {
  constructor(
    private readonly sitesRoot: string,
    private readonly siteId: string,
  ) {}

  async constraintsFor(parcel: Parcel): Promise<ZoningResult | null> {
    const fixture = await loadSiteFixture(this.sitesRoot, this.siteId);
    if (!fixture || fixture.parcelId !== parcel.id) return null;
    return { fixtureId: fixture.id, constraints: fixture.constraints };
  }
}
