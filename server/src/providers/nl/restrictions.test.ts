import { describe, expect, it } from "vitest";
import { foundationNotes, heritageNotes, itemsUrl, restrictionNotes, wkpbNotes } from "./restrictions";

const heritage = { text: "Delft", legalfoundationdate: "1978-09-11", namespace: "nlps-stadsendorpsgezichten", ci_citation: "https://kennis.cultureelerfgoed.nl/index.php/Gezicht/1656", localid: "10134568.00" };
const wkpb = { identificatie: "157880", naam_groep: "Erfgoedwet", grondslag_omschrijving: "Erfgoedwet: Afschrift inschrijving monument", monumentnummer: "525328", datum_beeindiging: null };
const foundation = { pc6: "2628KJ", fgr: "Zeekleigebied", legenda: "Kwetsbaar gebied - 80-100 %", percvoor1970: "55.5555" };

describe("restriction notes", () => {
  it("describes a protected townscape with its date and source", () => {
    const [n] = heritageNotes([heritage, heritage]);
    expect(n!.value).toMatch(/Protected townscape.*Delft, designated 1978-09-11/);
    expect(n!.prov).toMatchObject({ status: "extracted", source: heritage.ci_citation, quote: "Delft" });
    expect(heritageNotes([heritage, heritage])).toHaveLength(1);
  });

  it("lists Wkpb restrictions that are still in force, once each", () => {
    const notes = wkpbNotes([wkpb, wkpb, { ...wkpb, identificatie: "2", datum_beeindiging: "2020-01-01" }]);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.value).toMatch(/Wkpb, Erfgoedwet.*monument number 525328/);
  });

  it("rounds the share of pre-1970 buildings", () => {
    expect(foundationNotes([foundation])[0]!.value).toMatch(/2628KJ, Zeekleigebied.*56% of the buildings/);
  });

  it("ignores items without the text a note needs", () => {
    expect(heritageNotes([{}])).toEqual([]);
    expect(wkpbNotes([{ identificatie: "1" }])).toEqual([]);
    expect(foundationNotes([{ pc6: "1" }])).toEqual([]);
  });

  it("asks each layer for a 2 m box in RD", () => {
    const url = itemsUrl("https://api.pdok.nl/x/collections/y", [100.5, 200.25]);
    expect(url).toContain("bbox=99.5%2C199.25%2C101.5%2C201.25");
    expect(url).toContain("bbox-crs=");
  });

  it("keeps the notes of the layers that answer when another one fails", async () => {
    const fetchJson = async (_p: string, url: string) => {
      if (url.includes("rce")) throw new Error("down");
      if (url.includes("wkpb")) return { features: [{ properties: wkpb }] };
      return { features: [] };
    };
    const notes = await restrictionNotes(fetchJson, [1, 2]);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.value).toMatch(/Wkpb/);
  });
});
