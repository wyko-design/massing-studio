/**
 * Local regulations from the national register CVDR (Centrale Voorziening Decentrale Regelgeving), open and without a key.
 * Verified live on 2026-10-16:
 *   search  GET https://zoekservice.overheid.nl/sru/Search?version=1.2&operation=searchRetrieve&x-connection=cvdr&query=<CQL>
 *           (SRU 1.2; version 2.0 answers 406)  e.g.  title any "parkeernormen" AND creator="Delft"
 *   text    GET https://repository.officiele-overheidspublicaties.nl/cvdr/<CVDRnnn>/<version>/xml/<CVDRnnn>_<version>.xml
 * The regulation text is public domain ("vrij van auteursrecht").
 */
import { decode } from "./planText";

export type TextFetcher = (provider: string, url: string) => Promise<string>;

export type Regulation = {
  /** e.g. "CVDR714401_1" */
  id: string;
  title: string;
  /** ISO date of the last change, when the record has one. */
  date: string | null;
  /** Page for people. */
  url: string;
  /** Full text as XML. */
  xmlUrl: string;
};

const SRU = "https://zoekservice.overheid.nl/sru/Search";
const REPO = "https://repository.officiele-overheidspublicaties.nl/cvdr";

/** The XML text of a regulation may only be fetched from the official repository. */
export function isRegulationXmlUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "repository.officiele-overheidspublicaties.nl" && /^\/cvdr\/CVDR\d+\/\d+\/xml\/CVDR\d+_\d+\.xml$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function searchUrl(query: string, max = 20): string {
  const q = new URLSearchParams({ version: "1.2", operation: "searchRetrieve", "x-connection": "cvdr", startRecord: "1", maximumRecords: String(max), query });
  return `${SRU}?${q}`;
}

export function regulationFromId(id: string, title: string, date: string | null): Regulation | null {
  const m = /^(CVDR\d+)_(\d+)$/.exec(id);
  if (!m) return null;
  return { id, title, date, url: `https://lokaleregelgeving.overheid.nl/${m[1]}/${m[2]}`, xmlUrl: `${REPO}/${m[1]}/${m[2]}/xml/${id}.xml` };
}

/** Regulations in an SRU answer, newest change first. Only records with a usable id and a title. */
export function parseSearch(xml: string): Regulation[] {
  const tag = (record: string, name: string) => [...record.matchAll(new RegExp(`<(?:[a-z]+:)?${name}(?:\\s[^>]*)?>([^<]*)<`, "g"))].map((m) => decode(m[1]!.trim()));
  return xml
    .split(/<record>/)
    .slice(1)
    .flatMap((r) => {
      const id = tag(r, "identifier").find((v) => /^CVDR\d+_\d+$/.test(v));
      const title = tag(r, "title")[0];
      if (!id || !title) return [];
      const reg = regulationFromId(id, title, tag(r, "modified")[0] ?? null);
      return reg ? [reg] : [];
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

/** Most recent regulation of a municipality whose title has one of the words (tried in order). */
export async function findRegulation(fetchText: TextFetcher, municipality: string, titleWords: string[]): Promise<Regulation | null> {
  const name = municipality.replace(/"/g, "");
  for (const word of titleWords) {
    const found = parseSearch(await fetchText("cvdr-sru", searchUrl(`title any "${word}" AND creator="${name}"`)));
    if (found[0]) return found[0];
  }
  return null;
}

/** Plain text of a CVDR XML document; table rows and paragraphs become lines, cells are separated by spaces. */
export function regulationText(xml: string): string {
  return decode(
    xml
      .replace(/<\/(row|tr|p|li|al|titel|kop|nr|tekst|intro|lid|artikel)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
