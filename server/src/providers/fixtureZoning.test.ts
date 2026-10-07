import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SiteFixtureSchema, isPlaceholder, type Parcel } from "@massing/shared";
import { loadConfig } from "../config";
import { FixtureZoningProvider, loadSiteFixture } from "./fixtureZoning";

const { sitesRoot } = loadConfig({});
const parcel = (id: string): Parcel => ({ id, areaM2: 111, indicative: true, ring: [[0, 0], [1, 0], [1, 1]] });

describe("site fixtures", () => {
  it("every file in data/sites validates", async () => {
    const files = (await readdir(sitesRoot)).filter((f) => f.endsWith(".json"));
    expect(files).toEqual(expect.arrayContaining(["placeholder.json", "_template.json"]));
    for (const f of files) {
      const json: unknown = JSON.parse(await readFile(path.join(sitesRoot, f), "utf8"));
      expect(() => SiteFixtureSchema.parse(json), f).not.toThrow();
    }
  });

  it("placeholder fixture is all assumed and belongs to the stand-in parcel", async () => {
    const fixture = await loadSiteFixture(sitesRoot, "placeholder");
    expect(fixture?.parcelId).toBe("DEL00 K 2410");
    expect(fixture && isPlaceholder(fixture.constraints)).toBe(true);
    expect(fixture?.constraints.maxHeight.value).toBe(15);
  });
});

describe("FixtureZoningProvider", () => {
  it("returns the fixture for its own parcel only", async () => {
    const zoning = new FixtureZoningProvider(sitesRoot, "placeholder");
    expect((await zoning.constraintsFor(parcel("DEL00 K 2410")))?.fixtureId).toBe("placeholder");
    expect(await zoning.constraintsFor(parcel("DEL00 K 9999"))).toBeNull();
  });

  it("returns null for a missing fixture and throws on an invalid one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "sites-"));
    await writeFile(path.join(dir, "broken.json"), JSON.stringify({ id: "broken", constraints: { maxHeight: 12 } }));
    expect(await new FixtureZoningProvider(dir, "nope").constraintsFor(parcel("x"))).toBeNull();
    await expect(new FixtureZoningProvider(dir, "broken").constraintsFor(parcel("x"))).rejects.toThrow(/Invalid site fixture/);
  });
});
