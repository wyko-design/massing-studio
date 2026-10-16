import fs from "node:fs";
import { createRequire } from "node:module";
import { geoOrthographic, geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import { buildCountries, type WorldTopology } from "./index";
import { createMatcher, editDistance, normalise } from "./matcher";
import { POPULAR } from "./aliases";
import { countryCentre, fitScale, mainPolygon } from "../globe/geo";

const require = createRequire(import.meta.url);
const topology = JSON.parse(fs.readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8")) as WorldTopology;
const data = buildCountries(topology);
const { match, ghost, suggest } = createMatcher(data.entries, POPULAR);
const id = (input: string) => match(input)?.entry.id ?? null;

describe("normalise / editDistance", () => {
  it("drops case, diacritics and punctuation", () => {
    expect(normalise("  Côte d'Ivoire ")).toBe("cote d ivoire");
    expect(normalise("Česko")).toBe("cesko");
    expect(normalise("Wybrzeże Kości Słoniowej")).toBe("wybrzeze kosci sloniowej");
  });
  it("counts transpositions as one edit", () => {
    expect(editDistance("chlie", "chile")).toBe(1);
    expect(editDistance("netherlnds", "netherlands")).toBe(1);
    expect(editDistance("abc", "xyz")).toBe(3);
  });
});

describe("country data", () => {
  it("maps every world-atlas country to one entry and shape", () => {
    expect(data.entries.length).toBe(data.shapes.size);
    expect(data.shapes.get("528")?.name).toBe("Netherlands");
    // Australia appears twice in world-atlas (mainland + Ashmore/Cartier); merged into one shape
    expect(data.entries.filter((e) => e.id === "036")).toHaveLength(1);
    expect(data.shapes.get("name:Kosovo")).toBeDefined();
  });
});

describe("matcher", () => {
  it("matches exact names in English, Dutch and Polish", () => {
    expect(match("Netherlands")).toMatchObject({ kind: "exact" });
    expect(id("netherlands")).toBe("528");
    expect(id("Nederland")).toBe("528");
    expect(id("Holandia")).toBe("528");
    expect(id("Duitsland")).toBe("276");
    expect(id("Niemcy")).toBe("276");
    expect(id("Polska")).toBe("616");
    expect(id("FRANCE")).toBe("250");
  });

  it("ignores diacritics and case", () => {
    expect(id("cote d'ivoire")).toBe("384");
    expect(id("Côte d’Ivoire")).toBe("384");
    expect(id("tsjechië")).toBe("203");
    expect(id("cesko")).toBe("203");
  });

  it("matches aliases", () => {
    expect(match("Holland")).toMatchObject({ kind: "alias", entry: { id: "528" } });
    expect(id("UK")).toBe("826");
    expect(id("usa")).toBe("840");
    expect(id("England")).toBe("826");
    expect(id("Kosovo")).toBe("name:Kosovo");
  });

  it("accepts unique prefixes and rejects ambiguous ones", () => {
    expect(match("neth")).toMatchObject({ kind: "prefix", entry: { id: "528" } });
    expect(id("portu")).toBe("620");
    expect(match("united")).toBeNull();
    expect(match("new")).toBeNull();
    // "Niger" is a name in itself, even though "Nigeria" starts with it
    expect(id("niger")).toBe("562");
  });

  it("accepts small typos", () => {
    expect(match("Netherlnds")).toMatchObject({ kind: "typo", entry: { id: "528" } });
    expect(id("Germnay")).toBe("276");
    expect(id("Frnace")).toBe("250");
    expect(id("Polnad")).toBe("616");
  });

  it("returns null for nonsense", () => {
    expect(match("")).toBeNull();
    expect(match("   ")).toBeNull();
    expect(match("Atlantis")).toBeNull();
    expect(match("xyzzy")).toBeNull();
  });

  it("ghosts the rest of a unique prefix, in the name that matched", () => {
    expect(ghost("neth")).toBe("erlands");
    expect(ghost("Neder")).toBe("land");
    expect(ghost("costa ")).toBe("Rica");
    expect(ghost("costa")).toBe(" Rica");
    // ambiguous prefixes suggest the most popular match
    expect(ghost("united")).toBe(" States of America");
    expect(ghost("u")).toBe("nited States of America");
    expect(ghost("ger")).toBe("many");
    expect(ghost("Netherlands")).toBe("");
    expect(ghost("")).toBe("");
  });
});

describe("suggestions", () => {
  it("suggest from the first letter, most popular first", () => {
    expect(suggest("p")?.name).toBe("Poland");
    expect(suggest("n")?.name).toBe("Netherlands");
    expect(suggest("s")?.entry.id).toBe("724"); // Spain
    expect(suggest("")).toBeNull();
  });

  it("proposes the proper, capitalised name for misspellings", () => {
    expect(suggest("Frnace")).toMatchObject({ kind: "fix", name: "France" });
    expect(suggest("germny")).toMatchObject({ kind: "fix", name: "Germany" });
    expect(suggest("polnd")).toMatchObject({ kind: "fix", name: "Poland" });
    expect(suggest("xyzzyq")).toBeNull();
  });

  it("completions carry the proper name", () => {
    expect(suggest("neth")).toMatchObject({ kind: "complete", name: "Netherlands", rest: "erlands" });
  });
});

describe("globe geometry", () => {
  it("centres France on the mainland, not on an overseas territory", () => {
    const france = data.shapes.get("250")!.geometry;
    expect(france.coordinates.length).toBeGreaterThan(1);
    const [lon, lat] = countryCentre(france);
    expect(lon).toBeGreaterThan(-5);
    expect(lon).toBeLessThan(8);
    expect(lat).toBeGreaterThan(42);
    expect(lat).toBeLessThan(51);
  });

  it("fits the main polygon to the requested share of the frame", () => {
    const nl = data.shapes.get("528")!.geometry;
    const poly = mainPolygon(nl);
    const centre = countryCentre(nl);
    const frame = { w: 479, h: 511 };
    const scale = fitScale(poly, centre, frame, 0.5);
    const p = geoOrthographic().rotate([-centre[0], -centre[1]]).scale(scale).translate([0, 0]);
    const [[x0, y0], [x1, y1]] = geoPath(p).bounds(poly);
    const share = Math.max((x1 - x0) / frame.w, (y1 - y0) / frame.h);
    expect(share).toBeCloseTo(0.5, 3);
  });
});
