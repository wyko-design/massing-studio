import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findRegulation, isRegulationXmlUrl, parseSearch, regulationFromId, regulationText, searchUrl } from "./cvdr";

const sru = readFileSync(path.join(import.meta.dirname, "__fixtures__", "cvdr-sru-delft.xml"), "utf8");

describe("search", () => {
  it("builds an SRU 1.2 request (2.0 is refused by the service)", () => {
    const url = new URL(searchUrl('title any "parkeernormen" AND creator="Delft"'));
    expect(url.searchParams.get("version")).toBe("1.2");
    expect(url.searchParams.get("x-connection")).toBe("cvdr");
    expect(url.searchParams.get("query")).toBe('title any "parkeernormen" AND creator="Delft"');
  });

  it("reads the recorded Delft answer, newest first", () => {
    const found = parseSearch(sru);
    expect(found.map((r) => r.id)).toEqual(["CVDR714401_1", "CVDR661590_1", "CVDR610045_1"]);
    expect(found[0]).toMatchObject({ title: "Beleidsregels Parkeernormen Delft 2023", date: "2024-01-26", url: "https://lokaleregelgeving.overheid.nl/CVDR714401/1" });
    expect(found[0]!.xmlUrl).toBe("https://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml");
  });

  it("gives nothing for an answer without records", () => {
    expect(parseSearch("<searchRetrieveResponse><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>")).toEqual([]);
  });

  it("takes the newest regulation and tries the next title word when the first finds none", async () => {
    const asked: string[] = [];
    const fetchText = async (_p: string, url: string) => {
      const q = new URL(url).searchParams.get("query")!;
      asked.push(q);
      return q.includes('"parkeernormen"') ? "<r/>" : sru;
    };
    const reg = await findRegulation(fetchText, "Delft", ["parkeernormen", "parkeernorm"]);
    expect(reg?.id).toBe("CVDR714401_1");
    expect(asked).toHaveLength(2);
    expect(await findRegulation(async () => "<r/>", "Nergens", ["parkeernormen"])).toBeNull();
  });

  it("does not let a quote in the municipality name break the query", async () => {
    let query = "";
    await findRegulation(async (_p, url) => ((query = new URL(url).searchParams.get("query")!), "<r/>"), 'Del"ft', ["x"]);
    expect(query).toBe('title any "x" AND creator="Delft"');
  });
});

describe("regulation text", () => {
  it("only accepts XML from the official repository", () => {
    expect(isRegulationXmlUrl("https://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml")).toBe(true);
    expect(isRegulationXmlUrl("https://evil.example/cvdr/CVDR714401/1/xml/CVDR714401_1.xml")).toBe(false);
    expect(isRegulationXmlUrl("http://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml")).toBe(false);
    expect(isRegulationXmlUrl("https://repository.officiele-overheidspublicaties.nl/cvdr/../secret.xml")).toBe(false);
    expect(regulationFromId("not an id", "x", null)).toBeNull();
  });

  it("turns table rows into lines and cells into spaces", () => {
    const xml = "<tekst><row><entry>Woning &amp; tuin</entry><entry>0,5</entry></row><p>Tweede <b>regel</b></p></tekst>";
    expect(regulationText(xml)).toBe("Woning & tuin 0,5\nTweede regel");
  });
});
