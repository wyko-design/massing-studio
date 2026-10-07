import { describe, expect, it } from "vitest";
import { generateMassing, type SiteScene } from "@massing/shared";
import { k2410, k2410Area, k2410Envelope, k2410Rules, params, site } from "../../../shared/src/massing/__fixtures__/sites";
import { buildOverlay, streetLabel, streetName, type LeaderLabel } from "./labels";

describe("streetName", () => {
  it("drops the house number and postcode", () => {
    expect(streetName("Hendrik Casimirstraat 8, 2628KJ Delft")).toBe("Hendrik Casimirstraat");
    expect(streetName("Oude Delft 100, 2611CD Delft")).toBe("Oude Delft");
    expect(streetName("Markt 12A, 2611GW Delft")).toBe("Markt");
    expect(streetName("Voorstraat 3-5, 2611JJ Delft")).toBe("Voorstraat");
  });
  it("keeps a label without a number", () => {
    expect(streetName("Delft")).toBe("Delft");
  });
});

describe("streetLabel on K 2410", () => {
  it("sits outside the street edge, along it", () => {
    const label = streetLabel(k2410, 65, "Hendrik Casimirstraat")!;
    expect(label).not.toBeNull();
    // plan point of the anchor (world z = −north) lies towards the street (bearing 65°, east-north-east)
    const [x, , z] = label.anchor;
    const bearing = ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(bearing - 65)).toBeLessThan(25);
    // the text runs along the street edge, i.e. roughly perpendicular to the street bearing
    const dir = [label.along[0] - x, -(label.along[2] - z)] as const;
    const dot = (dir[0] * Math.sin((65 * Math.PI) / 180) + dir[1] * Math.cos((65 * Math.PI) / 180)) / Math.hypot(...dir);
    expect(Math.abs(dot)).toBeLessThan(0.2);
  });
  it("is absent when the street side is unknown", () => {
    expect(streetLabel(k2410, null, "Hendrik Casimirstraat")).toBeNull();
  });
});

describe("buildOverlay", () => {
  const scene: SiteScene = {
    origin: { lat: 52, lon: 4.36 },
    parcel: { id: "DEL00 K 2410", areaM2: 111, ring: k2410, indicative: true },
    context: [],
    meta: { address: "Hendrik Casimirstraat 8, 2628KJ Delft", sources: [], contextCount: 0, skippedContext: 0 },
  };
  const result = generateMassing(k2410Envelope, k2410Rules, params({ floors: 3 }), site(k2410Area));
  const input = {
    scene,
    envelope: k2410Envelope,
    showEnvelope: true,
    result,
    optionId: "A",
    optionName: "Quiet slab",
    streetSide: 65,
    annotations: true,
    streetLabels: true,
    placeholder: true,
  };

  it("formats every number from the computed metrics", () => {
    const o = buildOverlay(input);
    const proposal = o.labels.find((l): l is LeaderLabel => l.kind === "leader" && l.tag)!;
    expect(proposal.lines[0]).toBe("Option A · Quiet slab");
    expect(proposal.lines[1]).toBe(`${result.metrics.floors} floors · ${Math.round(result.metrics.height * 10) / 10} m · GFA ${Math.round(result.metrics.gfa)} m²`);
    const texts = o.labels.flatMap((l) => (l.kind === "leader" ? l.lines : [l.text]));
    expect(texts).toContain("Parcel DEL00 K 2410 · 111 m²");
    expect(texts).toContain("Envelope · max 15 m");
    expect(texts).toContain("Hendrik Casimirstraat");
    expect(o.watermark).toBe(true);
    expect(o.obstacles.length).toBe(result.volumes.reduce((n, v) => n + 2 * (v.footprint.coordinates[0]!.length - 1), 0));
  });

  it("anchors the proposal tag on its roof", () => {
    const proposal = buildOverlay(input).labels.find((l): l is LeaderLabel => l.kind === "leader" && l.tag)!;
    expect(proposal.anchors.every((p) => Math.abs(p[1] - result.metrics.height) < 1e-6)).toBe(true);
  });

  it("respects the toggles", () => {
    expect(buildOverlay({ ...input, annotations: false, streetLabels: false }).labels).toEqual([]);
    expect(buildOverlay({ ...input, annotations: false }).caption).toEqual([]);
    expect(buildOverlay({ ...input, showEnvelope: false }).labels.some((l) => l.kind === "leader" && l.lines[0]!.startsWith("Envelope"))).toBe(false);
    expect(buildOverlay({ ...input, streetSide: null }).labels.some((l) => l.kind === "street")).toBe(false);
  });
});
