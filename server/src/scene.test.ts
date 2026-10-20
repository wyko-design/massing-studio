import { describe, expect, it, vi } from "vitest";
import { unknownConstraints, type Constrained, type SiteConstraints } from "@massing/shared";
import { buildScene, enrichConstraints, type SceneProviders } from "./scene";

const note = (text: string): Constrained<string> => ({ value: text, prov: { source: "t", status: "extracted" } });
const withStreet = (status: "assumed" | "verified" | "extracted" | "user_override", value: number | null): SiteConstraints => ({
  ...unknownConstraints("test"),
  streetSide: { value, unit: "°", prov: { source: "s", status } },
});

describe("enrichConstraints", () => {
  const street = { bearing: 67, distanceM: 3.2 };

  it("fills a missing or assumed street side from the road, with its source", () => {
    const filled = enrichConstraints(unknownConstraints("x"), street, []).streetSide!;
    expect(filled).toMatchObject({ value: 67, prov: { status: "extracted" } });
    expect(filled.prov.source).toMatch(/BGT.*3\.2 m/);
    expect(enrichConstraints(withStreet("assumed", 65), street, []).streetSide!.value).toBe(67);
  });

  it("never replaces a verified, extracted or overridden street side", () => {
    for (const status of ["verified", "extracted", "user_override"] as const) {
      expect(enrichConstraints(withStreet(status, 123), street, []).streetSide!.value).toBe(123);
    }
  });

  it("appends restriction notes after the plan notes", () => {
    const base = { ...unknownConstraints("x"), notes: [note("plan note")] };
    expect(enrichConstraints(base, null, [note("heritage")]).notes.map((n) => n.value)).toEqual(["plan note", "heritage"]);
  });

  it("changes nothing when there is nothing to add", () => {
    const base = unknownConstraints("x");
    expect(enrichConstraints(base, null, [])).toBe(base);
  });
});

describe("buildScene extras", () => {
  const ring: [number, number][] = [[100, 100], [110, 100], [110, 110], [100, 110]];
  const providers = (extra: Partial<SceneProviders>): SceneProviders => ({
    geocoder: { geocode: async () => ({ label: "Test 1", point: { x: 105, y: 105 } }) },
    parcels: { parcelAt: async () => ({ id: "T 1", areaM2: 100, ring, indicative: true }) },
    context: { buildingsNear: async () => [] },
    zoning: { constraintsFor: async () => null },
    skippedContext: () => 0,
    ...extra,
  });

  it("puts the street side and restriction notes into the constraints and the source list", async () => {
    const scene = await buildScene(
      providers({ streetSide: async () => ({ bearing: 90, distanceM: 2 }), restrictions: async () => [note("Protected townscape")] }),
      "Test 1",
    );
    expect(scene.zoning!.constraints.streetSide!.value).toBe(90);
    expect(scene.zoning!.constraints.notes.map((n) => n.value)).toContain("Protected townscape");
    expect(scene.meta!.sources).toEqual(expect.arrayContaining(["PDOK BGT roads (street side)", "PDOK heritage, Wkpb and foundation-risk layers"]));
  });

  it("still loads when an optional source fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const scene = await buildScene(
        providers({
          streetSide: async () => {
            throw new Error("BGT down");
          },
          restrictions: async () => {
            throw new Error("PDOK down");
          },
        }),
        "Test 1",
      );
      expect(scene.zoning!.constraints.maxHeight.value).toBeNull();
      expect(scene.zoning!.constraints.streetSide?.value ?? null).toBeNull();
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  describe("parking policy", () => {
    const parking = {
      municipality: "Delft",
      regulation: { title: "Beleidsregels Parkeernormen Delft 2023", id: "CVDR714401_1", date: "2024-01-26", url: "https://lokaleregelgeving.overheid.nl/CVDR714401/1" },
      zones: [],
      rows: [],
      suggestedZone: null,
      notes: [],
      textUrl: "https://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml",
    };
    const withCity = (municipality?: string): Partial<SceneProviders> => ({
      geocoder: { geocode: async () => ({ label: "Test 1", point: { x: 105, y: 105 }, ...(municipality ? { municipality } : {}) }) },
    });

    it("asks for the policy of the geocoded municipality and lists it in the scene and its sources", async () => {
      const asked: unknown[] = [];
      const scene = await buildScene(providers({ ...withCity("Delft"), parking: async (ctx) => (asked.push(ctx), parking) }), "Test 1");
      expect(asked).toEqual([{ municipality: "Delft", point: [expect.any(Number), expect.any(Number)] }]);
      expect(scene.parking?.regulation.id).toBe("CVDR714401_1");
      expect(scene.meta!.sources.some((s) => /Parking policy: Beleidsregels Parkeernormen Delft 2023/.test(s))).toBe(true);
    });

    it("does not ask without a municipality, and survives a failing lookup", async () => {
      let called = 0;
      const none = await buildScene(providers({ ...withCity(), parking: async () => (called++, parking) }), "Test 1");
      expect(called).toBe(0);
      expect(none.parking).toBeUndefined();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const failed = await buildScene(
          providers({
            ...withCity("Delft"),
            parking: async () => {
              throw new Error("register down");
            },
          }),
          "Test 1",
        );
        expect(failed.parking).toBeUndefined();
      } finally {
        warn.mockRestore();
      }
    });
  });
});
