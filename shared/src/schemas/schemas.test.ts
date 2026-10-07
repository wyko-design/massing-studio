import { describe, expect, it } from "vitest";
import { SiteConstraintsSchema, MassingParamsSchema, SiteSceneSchema, sampleScene } from "../index";

const assumed = { source: "test", status: "assumed" as const };

describe("schemas", () => {
  it("accepts constraints where a value is explicitly unknown (null)", () => {
    const parsed = SiteConstraintsSchema.parse({
      allowedFunctions: { value: ["Wonen"], prov: assumed },
      maxHeight: { value: null, unit: "m", prov: assumed },
      setbacks: {
        street: { value: null, prov: assumed },
        side: { value: null, prov: assumed },
        rear: { value: null, prov: assumed },
      },
      notes: [],
    });
    expect(parsed.maxHeight.value).toBeNull();
  });
  it("rejects a constraint without provenance", () => {
    expect(() => SiteConstraintsSchema.parse({ maxHeight: { value: 12 } })).toThrow();
  });
  it("rejects invalid massing params", () => {
    expect(() => MassingParamsSchema.parse({ typology: "pyramid" })).toThrow();
  });
  it("validates the sample scene", () => {
    const scene = SiteSceneSchema.parse(sampleScene);
    expect(scene.context.length).toBeGreaterThanOrEqual(10);
    expect(scene.proposal?.length).toBeGreaterThan(0);
  });
});
