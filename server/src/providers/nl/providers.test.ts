import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { polygonArea } from "@massing/shared";
import { Bag3dContextProvider, bag3dUrl, parseBag3dPage } from "./bag3d";
import { parcelUrl, parseParcel } from "./kadasterParcel";
import { geocodeUrl, parseGeocode, parseWktPoint } from "./locatieserver";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8"));

const POINT = { x: 85632.029, y: 446609.492 };

describe("locatieserver", () => {
  it("parses WKT points", () => {
    expect(parseWktPoint("POINT(84270.399 447423)")).toEqual({ x: 84270.399, y: 447423 });
    expect(parseWktPoint("LINESTRING(1 2, 3 4)")).toBeNull();
  });
  it("parses a recorded response", () => {
    expect(parseGeocode(fixture("locatieserver.json"))).toEqual({
      label: "Hendrik Casimirstraat 8, 2628KJ Delft",
      point: POINT,
      addressId: "0503200000026076",
    });
  });
  it("returns null without hits", () => {
    expect(parseGeocode({ response: { docs: [] } })).toBeNull();
  });
  it("asks for address results only", () => {
    expect(geocodeUrl("a b")).toContain("fq=type%3Aadres");
  });
});

describe("kadaster parcel", () => {
  it("picks the polygon containing the point, open ring, in RD metres", () => {
    const parcel = parseParcel(fixture("perceel.json"), POINT);
    expect(parcel).not.toBeNull();
    expect(parcel!.id).toBe("DEL00 K 2410");
    expect(parcel!.areaM2).toBe(111);
    expect(parcel!.indicative).toBe(true);
    expect(parcel!.ring[0]).not.toEqual(parcel!.ring[parcel!.ring.length - 1]);
    expect(parcel!.ring.every(([x, y]) => x > 85000 && y > 446000)).toBe(true);
    // registered area and computed polygon area agree within 5 %
    expect(Math.abs(polygonArea(parcel!.ring) - 111) / 111).toBeLessThan(0.05);
  });
  it("returns null when no polygon contains the point", () => {
    expect(parseParcel(fixture("perceel.json"), { x: 0, y: 0 })).toBeNull();
  });
  it("requests RD output and bbox", () => {
    const url = parcelUrl(POINT);
    expect(url).toContain("crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F28992");
    expect(url).toContain("bbox-crs=");
  });
});

describe("3DBAG", () => {
  it("decodes footprint vertices and roof height above ground", () => {
    const { buildings, skipped, next } = parseBag3dPage(fixture("bag3d-page1.json"));
    expect(skipped).toBe(0);
    expect(next).toContain("offset=3");
    const b = buildings.find((x) => x.id === "NL.IMBAG.Pand.0503100000016348")!;
    // b3_h_dak_70p 7.133 − b3_h_maaiveld (−0.649); LoD1.2 z range in the fixture is 7.796 m
    expect(b.height).toBeCloseTo(7.782, 2);
    expect(b.ring.length).toBeGreaterThanOrEqual(3);
    expect(b.ring.every(([x, y]) => Math.abs(x - 85631) < 30 && Math.abs(y - 446608) < 30)).toBe(true);
  });
  it("skips buildings without a usable height", () => {
    const page = structuredClone(fixture("bag3d-page1.json")) as {
      features: { CityObjects: Record<string, { attributes?: Record<string, unknown> }> }[];
    };
    for (const f of page.features) {
      for (const o of Object.values(f.CityObjects)) if (o.attributes) o.attributes.b3_h_dak_70p = null;
    }
    const { buildings, skipped } = parseBag3dPage(page);
    expect(buildings).toHaveLength(0);
    expect(skipped).toBe(1);
  });
  it("follows next links until exhausted and de-duplicates", async () => {
    const empty = { metadata: { transform: { scale: [0.001, 0.001, 0.001], translate: [0, 0, 0] } }, features: [], links: [] };
    const first = bag3dUrl(POINT, 250);
    const page1 = fixture("bag3d-page1.json") as { links: { rel: string; href: string }[] };
    const page2 = fixture("bag3d-page2.json") as { links: { rel: string; href: string }[] };
    const next1 = page1.links.find((l) => l.rel === "next")!.href;
    const next2 = page2.links.find((l) => l.rel === "next")!.href;
    const calls: string[] = [];
    const provider = new Bag3dContextProvider(async (_p, url) => {
      calls.push(url);
      if (url === first) return page1;
      if (url === next1) return page2;
      if (url === next2) return empty;
      throw new Error(`unexpected ${url}`);
    });
    const buildings = await provider.buildingsNear(POINT, 250);
    expect(calls).toHaveLength(3);
    expect(new Set(buildings.map((b) => b.id)).size).toBe(buildings.length);
    expect(buildings.length).toBeGreaterThanOrEqual(2);
  });
});
