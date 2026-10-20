import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_POLICY_CHARS, fetchPolicyExcerpt, housingLines, housingNotes, loadParkingPolicy, parseDelftWonen, rowValues, suggestZone } from "./parkingPolicy";

const fx = (name: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");
const text = fx("cvdr-delft-wonen.txt");
const sru = fx("cvdr-sru-delft.xml");

describe("parseDelftWonen", () => {
  const rows = parseDelftWonen(text);

  it("reads the five size bands and the student and care rows from the real table", () => {
    expect(rows.filter((r) => r.kind === "size").map((r) => [r.fromM2, r.toM2])).toEqual([[null, 50], [50, 75], [75, 100], [100, 125], [125, null]]);
    expect(rows.map((r) => r.kind)).toEqual(expect.arrayContaining(["student", "care"]));
  });

  it("maps the twelve numbers to the zones (checked against the printed table)", () => {
    const band = rows.find((r) => r.fromM2 === 50)!;
    expect(band.values).toEqual({
      autoluwplus: { residents: 0, visitors: 0 },
      binnenstad: { residents: 0.3, visitors: 0.1 },
      rest: { residents: 0.5, visitors: 0.1 },
      buiten: { residents: 0.6, visitors: 0.2 },
      campus: { residents: 0.5, visitors: 0.1 },
      schieoevers: { residents: 0.4, visitors: 0.1 },
    });
    expect(rows.find((r) => r.toM2 === 50)!.values.buiten).toEqual({ residents: 0.3, visitors: 0.2 });
    expect(rows.find((r) => r.fromM2 === 125)!.values.rest).toEqual({ residents: 1, visitors: 0.1 });
  });

  it("gives up rather than guess when the layout is not the expected one", () => {
    expect(parseDelftWonen("Niets over wonen.")).toEqual([]);
    expect(parseDelftWonen(text.replace("Rest bebouwde kom Delft", "Overig gebied"))).toEqual([]);
    expect(parseDelftWonen(text.replace("Woning tussen 50 tot 75 m2 GO Per woning 0 0 0,3 0,1 0,5 0,1 0,6 0,2 0,5 0,1 0,4 0,1", "Woning tussen 50 tot 75 m2 GO Per woning 0 0 0,3 0,1"))).toEqual([]);
    expect(parseDelftWonen(text.replace("tussen 50 tot 75", "tussen 55 tot 75"))).toEqual([]);
    expect(parseDelftWonen(text.replace("0,6 0,2 0,5 0,1 0,4 0,1", "9,6 0,2 0,5 0,1 0,4 0,1"))).toEqual([]);
  });

  it("row values need exactly twelve sane numbers", () => {
    expect(rowValues([1, 2, 3])).toBeNull();
    expect(rowValues(Array(12).fill(0))).not.toBeNull();
    expect(rowValues([...Array(11).fill(0), 7])).toBeNull();
  });
});

describe("notes and zone guess", () => {
  it("copies the housing sentences of the policy as they are", () => {
    const notes = housingNotes(text);
    expect(notes).toHaveLength(4);
    expect(notes[0]).toBe("Specifiek voor woonfuncties beperken we de parkeernorm daarnaast tot maximaal één parkeerplaats per woning.");
    expect(notes.some((n) => /maximaal 10 woningen/.test(n))).toBe(true);
  });

  it("guesses the zone from plan names, with the plan as the reason", () => {
    expect(suggestZone(["Flitsbezorging", "Binnenstad 2012"])).toMatchObject({ id: "binnenstad" });
    expect(suggestZone(["TU-Noord (De noordelijke Wippolder)"])).toMatchObject({ id: "campus" });
    expect(suggestZone(["Schieoevers Noord (Kabeldistrict)"])).toMatchObject({ id: "schieoevers" });
    expect(suggestZone(["Buitengebied Delft"])).toMatchObject({ id: "buiten" });
    expect(suggestZone(["Facetherziening parkeren"])).toMatchObject({ id: "rest" });
    expect(suggestZone(["Binnenstad 2012"]).reason).toContain("Binnenstad 2012");
  });
});

describe("loadParkingPolicy", () => {
  const xml = `<tekst>${text.split("\n").map((l) => `<p>${l}</p>`).join("")}</tekst>`;
  const fetchText = async (_p: string, url: string) => (url.includes("zoekservice") ? sru : xml);

  it("returns the Delft table, zones, notes and a zone guess", async () => {
    const p = await loadParkingPolicy({ fetchText, municipality: "Delft", planNames: ["TU-Noord"] });
    expect(p).toMatchObject({ municipality: "Delft", regulation: { id: "CVDR714401_1", date: "2024-01-26" }, suggestedZone: { id: "campus" } });
    expect(p!.rows).toHaveLength(7);
    expect(p!.zones).toHaveLength(6);
    expect(p!.notes.length).toBe(4);
  });

  it("keeps the regulation for the AI when another municipality's table cannot be read", async () => {
    const p = await loadParkingPolicy({ fetchText, municipality: "Elders", planNames: [] });
    expect(p).toMatchObject({ rows: [], zones: [], suggestedZone: null, textUrl: expect.stringContaining("CVDR714401") });
  });

  it("is null when the register has no parking policy for the municipality", async () => {
    expect(await loadParkingPolicy({ fetchText: async () => "<r/>", municipality: "Nergens", planNames: [] })).toBeNull();
  });
});

describe("policy excerpt for the AI", () => {
  const long = ["Algemeen verhaal zonder cijfers.", "Voor een woning geldt 1,5 parkeerplaats.", "Slotzin.", ...Array(400).fill("Niets over huizen 12.")].join("\n");

  it("keeps the housing lines with a number and their neighbours, and is capped", () => {
    expect(housingLines(long)).toBe("Algemeen verhaal zonder cijfers.\nVoor een woning geldt 1,5 parkeerplaats.\nSlotzin.");
    expect(housingLines("Niets hier.")).toBeNull();
    expect(housingLines(Array(2000).fill("woning 1").join("\n"))!.length).toBe(MAX_POLICY_CHARS);
  });

  it("only fetches from the official repository", async () => {
    let calls = 0;
    const ft = async () => (calls++, `<p>${long}</p>`);
    expect(await fetchPolicyExcerpt(ft, "https://evil.example/cvdr/CVDR1/1/xml/CVDR1_1.xml")).toEqual([]);
    expect(calls).toBe(0);
    const [e] = await fetchPolicyExcerpt(ft, "https://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml");
    expect(e!.title).toContain("CVDR714401");
    expect(e!.text).toMatch(/1,5 parkeerplaats/);
  });
});
