import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_EXCERPT_CHARS, MAX_GENERAL, articleHtml, generalRefs, fetchPlanExcerpts, htmlToText, isPlanTextUrl, planTextFrom } from "./planText";

const page = readFileSync(path.join(import.meta.dirname, "__fixtures__", "rp-text-bp0005-2.3.html"), "utf8");

/** Two articles in one document, with a table of contents that links to both (as in IMRO2012 plans). */
const doc = `<html><body>
<ul><li><a href="r.html#_15_Wonen">Artikel 15 Wonen</a></li><li><a href="r.html#_16_Water">Artikel 16 Water</a></li></ul>
<div id="_15_Wonen"><h3>Artikel 15 Wonen</h3><p>De bouwhoogte mag niet meer bedragen dan 11 m &amp; de goothoogte 6,5&nbsp;m.</p></div>
<div id="_16_Water"><h3>Artikel 16 Water</h3><p>Geen bouwwerken toegestaan.</p></div>
</body></html>`;

describe("htmlToText", () => {
  it("drops tags and entities, keeps line breaks between blocks", () => {
    const t = htmlToText("<body><p>Een &amp; twee</p><p>drie&nbsp;vier<br/>vijf</p><script>x()</script></body>");
    expect(t).toBe("Een & twee\ndrie vier\nvijf");
  });

  it("reads a real plan article page", () => {
    const t = htmlToText(page);
    expect(t).toMatch(/Bouwregels/);
    expect(t).toMatch(/maximaal 5,5 m/);
    expect(t).not.toMatch(/<\w+/);
  });
});

describe("articleHtml", () => {
  it("cuts one article out of a document, not the table of contents or the next article", () => {
    const part = articleHtml(doc, "_15_Wonen")!;
    expect(part).toContain("De bouwhoogte");
    expect(part).not.toContain("Geen bouwwerken");
    expect(part).not.toContain("Artikel 16 Water</a>");
  });

  it("returns null for an unknown anchor", () => {
    expect(articleHtml(doc, "_99_Nergens")).toBeNull();
  });
});

describe("planTextFrom", () => {
  it("returns the anchored article as plain text", () => {
    expect(planTextFrom(doc, "_15_Wonen")).toBe("Artikel 15 Wonen\nDe bouwhoogte mag niet meer bedragen dan 11 m & de goothoogte 6,5 m.");
  });

  it("is capped, and null when nothing readable is left", () => {
    expect(planTextFrom(`<body><p>${"woord ".repeat(10_000)}</p></body>`, null)!.length).toBe(MAX_EXCERPT_CHARS);
    expect(planTextFrom("<body></body>", null)).toBeNull();
    expect(planTextFrom(doc, "_99_Nergens")).toBeNull();
  });
});

describe("isPlanTextUrl", () => {
  it("accepts only plan documents on ruimtelijkeplannen.nl", () => {
    expect(isPlanTextUrl("https://ruimtelijkeplannen.nl/documents/NL.IMRO.0503.BP0005-2001/r_NL.IMRO.0503.BP0005-2001_2.3.html")).toBe(true);
    expect(isPlanTextUrl("https://www.ruimtelijkeplannen.nl/documents/X/r_X.html")).toBe(true);
    expect(isPlanTextUrl("http://ruimtelijkeplannen.nl/documents/X/r_X.html")).toBe(false);
    expect(isPlanTextUrl("https://evil.example/documents/X/r_X.html")).toBe(false);
    expect(isPlanTextUrl("https://ruimtelijkeplannen.nl.evil.example/documents/X/r_X.html")).toBe(false);
    expect(isPlanTextUrl("https://ruimtelijkeplannen.nl/web-roo/rest/config/site")).toBe(false);
    expect(isPlanTextUrl("not a url")).toBe(false);
  });
});

describe("fetchPlanExcerpts", () => {
  it("fetches a shared document once, skips foreign links and unreadable pages", async () => {
    const calls: string[] = [];
    const fetchText = async (_p: string, url: string) => {
      calls.push(url);
      return doc;
    };
    const base = "https://ruimtelijkeplannen.nl/documents/X/r_X.html";
    const out = await fetchPlanExcerpts(fetchText, [
      { title: "Wonen", url: `${base}#_15_Wonen` },
      { title: "Water", url: `${base}#_16_Water` },
      { title: "Missing", url: `${base}#_99_Nergens` },
      { title: "Foreign", url: "https://evil.example/documents/X/r_X.html" },
    ]);
    expect(calls).toEqual([base]);
    expect(out.map((e) => e.title)).toEqual(["Wonen", "Water"]);
    expect(out[0]!.text).toMatch(/11 m/);
  });
});

describe("general articles", () => {
  const base = "https://ruimtelijkeplannen.nl/documents/NL.IMRO.0503.BP0031-2001/r_NL.IMRO.0503.BP0031-2001.html";
  const big = `<html><body>
<div id="_15_Wonen"><h3>Artikel 15 Wonen</h3><p>Regels van het wonen, lang genoeg om gelezen te worden.</p></div>
<div id="_24_Algemeneaanduidingsregels"><h3>Artikel 24 Algemene aanduidingsregels</h3><p>Aanduidingen gelden voor alle bestemmingen, ook buiten het bouwvlak.</p></div>
<div id="_25_Algemenebouwregels"><h3>Artikel 25 Algemene bouwregels</h3><p>Bouwwerken moeten op minimaal 3 m van de weg staan, behalve bij een ondergeschikte uitbouw.</p></div>
<div id="_2_Wijzevanmeten"><h3>Artikel 2 Wijze van meten</h3><p>De goothoogte wordt gemeten vanaf het peil tot de bovenkant van de goot.</p></div>
<div id="_1_Begrippen"><h3>Artikel 1 Begrippen</h3><p>Lang begrippenlijstje dat niet gelezen hoeft te worden door het model.</p></div>
</body></html>`;

  it("finds the general articles as anchors in a single-document plan, without begrippen", async () => {
    const refs = await generalRefs(async () => "", { title: "Wonen", url: `${base}#_15_Wonen` }, base, big);
    expect(refs.map((r) => r.url.split("#")[1]).sort()).toEqual(["_24_Algemeneaanduidingsregels", "_25_Algemenebouwregels", "_2_Wijzevanmeten"]);
  });

  it("finds them through the chapter pages of an article-per-page plan", async () => {
    const page = "https://ruimtelijkeplannen.nl/documents/NL.IMRO.0503.BP0005-2001/r_NL.IMRO.0503.BP0005-2001_2.3.html";
    const pages: Record<string, string> = {
      "r_NL.IMRO.0503.BP0005-2001_3.html": `<a href="r_NL.IMRO.0503.BP0005-2001_3.20.html">Artikel 20 Algemene bouwregels</a><a href="r_NL.IMRO.0503.BP0005-2001_3.18.html">Artikel 18 Antidubbeltelregel</a>`,
      "r_NL.IMRO.0503.BP0005-2001_1.html": `<a href="r_NL.IMRO.0503.BP0005-2001_1.2.html">Artikel 2 Wijze van meten</a><a href="r_NL.IMRO.0503.BP0005-2001_1.1.html">Artikel 1 Begrippen</a>`,
    };
    const refs = await generalRefs(async (_p, u) => pages[u.split("/").pop()!] ?? "", { title: "x", url: page }, page, "");
    expect(refs.map((r) => r.url.split("/").pop())).toEqual(["r_NL.IMRO.0503.BP0005-2001_1.2.html", "r_NL.IMRO.0503.BP0005-2001_3.20.html"]);
  });

  it("adds them after the bestemming articles, each capped, and survives a missing chapter page", async () => {
    const out = await fetchPlanExcerpts(async (_p, u) => (u === base ? big : ""), [{ title: "Wonen", url: `${base}#_15_Wonen` }], { general: true });
    expect(out[0]!.title).toBe("Wonen");
    expect(out.length).toBe(1 + 3);
    expect(out.length - 1).toBeLessThanOrEqual(MAX_GENERAL);
    expect(out.some((e) => /minimaal 3 m van de weg/.test(e.text))).toBe(true);
    expect(out.some((e) => /Begrippen/.test(e.text))).toBe(false);
  });
});
