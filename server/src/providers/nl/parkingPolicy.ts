/**
 * Parking norm for housing from the municipal policy ("Beleidsregels Parkeernormen", register CVDR).
 * Delft's 2023 policy (CVDR714401, verified 2026-10-16) has one table per function; the one for housing ("Wonen") lists, per
 * dwelling size band, spaces per dwelling for residents and visitors in six zones:
 *   Autoluw-plusgebied | Binnenstad (minimum, maximum residents, maximum visitors) | Rest bebouwde kom | Buitengebied | Campus TU Delft | Schieoevers Noord
 * i.e. 12 numbers per row. The parser checks the header and the shape of every row and gives up (empty table) on anything else,
 * so a changed layout never yields a wrong norm. Which zone a plot lies in is only drawn as a figure; `suggestZone` guesses it from the
 * names of the plan areas at the plot and the answer is marked as a guess.
 */
import type { ParkingPolicy, ParkingRow, ParkingZone } from "@massing/shared";
import type { PlanExcerpt } from "@massing/shared";
import { findRegulation, isRegulationXmlUrl, regulationText, type Regulation, type TextFetcher } from "./cvdr";

export const DELFT_ZONES: ParkingZone[] = [
  { id: "autoluwplus", label: "Autoluw-plusgebied (city centre)", basis: "maximum" },
  { id: "binnenstad", label: "Binnenstad Delft", basis: "maximum" },
  { id: "rest", label: "Rest bebouwde kom Delft", basis: "norm" },
  { id: "buiten", label: "Buitengebied Delft", basis: "norm" },
  { id: "campus", label: "Campus TU Delft", basis: "norm" },
  { id: "schieoevers", label: "Schieoevers Noord", basis: "norm" },
];

const NUM = String.raw`\d+(?:,\d+)?`;
const TWELVE = String.raw`((?:${NUM}\s+){11}${NUM})`;
const HEADER = /Wonen\s+Functie\s+Eenheid\s+Autoluw-?\s?plusgebied\s+Binnenstad Delft\s+Rest bebouwde kom Delft\s+Buiten ?gebied Delft\s+Campus TU Delft\s+Schieoevers Noord/i;

const n = (s: string) => Number(s.replace(",", "."));

/** The 12 numbers of a row → values per zone id. Exported for tests. */
export function rowValues(nums: number[]): ParkingRow["values"] | null {
  if (nums.length !== 12 || nums.some((v) => !Number.isFinite(v) || v < 0 || v > 5)) return null;
  const [auto, , binRes, binVis, restRes, restVis, buitRes, buitVis, campRes, campVis, schRes, schVis] = nums as [number, number, number, number, number, number, number, number, number, number, number, number];
  return {
    autoluwplus: { residents: auto, visitors: 0 },
    binnenstad: { residents: binRes, visitors: binVis },
    rest: { residents: restRes, visitors: restVis },
    buiten: { residents: buitRes, visitors: buitVis },
    campus: { residents: campRes, visitors: campVis },
    schieoevers: { residents: schRes, visitors: schVis },
  };
}

/** The housing table of the Delft policy, or an empty list when the text does not look as expected. */
export function parseDelftWonen(text: string): ParkingRow[] {
  const flat = text.replace(/\s+/g, " ");
  const head = HEADER.exec(flat);
  if (!head) return [];
  const rest = flat.slice(head.index + head[0].length);
  const block = rest.slice(0, Math.max(0, rest.search(/Opmerkingen/)) || rest.length);
  const rows: ParkingRow[] = [];

  for (const m of block.matchAll(new RegExp(String.raw`(Woning (?:kleiner dan|tussen|groter dan) [^P]*?GO)\s+Per woning\s+${TWELVE}`, "gi"))) {
    const label = m[1]!.trim();
    const values = rowValues(m[2]!.split(/\s+/).map(n));
    if (!values) return [];
    const numbers = [...label.matchAll(/\d+/g)].map((x) => Number(x[0]));
    const band = /kleiner dan/i.test(label) ? [null, numbers[0]] : /groter dan/i.test(label) ? [numbers[0], null] : [numbers[0], numbers[1]];
    if (band.some((v) => v === undefined)) return [];
    rows.push({ label, kind: "size", fromM2: band[0] ?? null, toM2: band[1] ?? null, values });
  }
  // the size bands must cover every dwelling: open below, open above, no gaps in between
  const size = rows.filter((r) => r.kind === "size").sort((a, b) => (a.fromM2 ?? -1) - (b.fromM2 ?? -1));
  const covers = size.length >= 4 && size[0]!.fromM2 === null && size[size.length - 1]!.toM2 === null && size.every((r, i) => i === 0 || r.fromM2 === size[i - 1]!.toM2);
  if (!covers) return [];

  for (const [kind, re] of [
    ["student", String.raw`(Studenten-?\s?woning)\s+Per \S+\s+${TWELVE}`],
    ["care", String.raw`(Zorgwoning)\s+Per woning\s+${TWELVE}`],
  ] as const) {
    const m = new RegExp(re, "i").exec(block);
    const values = m && rowValues(m[2]!.split(/\s+/).map(n));
    if (m && values) rows.push({ label: m[1]!.replace("Studenten-woning", "Studentenwoning"), kind, fromM2: null, toM2: null, values });
  }
  return rows;
}

/** Sentences of the policy that matter for housing, copied as they are. */
export function housingNotes(text: string): string[] {
  const flat = text.replace(/\s+/g, " ");
  const find = (re: RegExp) => re.exec(flat)?.[0].trim();
  return [
    find(/Specifiek voor woonfuncties beperken we de parkeernorm daarnaast tot maximaal één parkeerplaats per woning\./),
    find(/Hier geldt de autoluw-plusregeling en is de autoparkeernorm gelijk aan nul\./),
    find(/Nulvergunningregeling Een regeling in het gereguleerd gebied van Delft[^.]*\./),
    find(/In de Delftse binnenstad wordt alleen nog vastgelegd hoeveel autoparkeerplaatsen er maximaal mogen komen\./),
  ].filter((s): s is string => !!s);
}

/**
 * A guess of the Delft parking zone from the names of the plan areas that cover the plot. The policy draws its zones on a map
 * that is not published as data; plan names are a rough stand-in (the autoluw-plus part of the centre cannot be told apart).
 */
export function suggestZone(planNames: string[]): { id: string; reason: string } {
  const named = (re: RegExp) => planNames.find((p) => re.test(p));
  const hit = (id: string, plan: string) => ({ id, reason: `The plot lies in the plan area "${plan}".` });
  let p: string | undefined;
  if ((p = named(/binnenstad/i))) return hit("binnenstad", p);
  if ((p = named(/schieoevers noord/i))) return hit("schieoevers", p);
  if ((p = named(/\bTU\b|campus/i))) return hit("campus", p);
  if ((p = named(/buitengebied/i))) return hit("buiten", p);
  return { id: "rest", reason: "No special plan area found, so the rest of the built-up area." };
}

const TITLE_WORDS = ["parkeernormen", "parkeernorm", "parkeerbeleid"];

export type ParkingPolicyInput = {
  fetchText: TextFetcher;
  municipality: string;
  /** Names of the municipal plans covering the plot (for the zone guess). */
  planNames: string[];
};

/** The parking policy of the plot's municipality, with the housing table when it can be read. Null when no regulation is found. */
export async function loadParkingPolicy({ fetchText, municipality, planNames }: ParkingPolicyInput): Promise<ParkingPolicy | null> {
  const reg: Regulation | null = await findRegulation(fetchText, municipality, TITLE_WORDS);
  if (!reg) return null;
  const text = regulationText(await fetchText("cvdr", reg.xmlUrl));
  const rows = /delft/i.test(municipality) ? parseDelftWonen(text) : [];
  return {
    municipality,
    regulation: { title: reg.title, id: reg.id, date: reg.date, url: reg.url },
    zones: rows.length ? DELFT_ZONES : [],
    rows,
    suggestedZone: rows.length ? suggestZone(planNames) : null,
    notes: rows.length ? housingNotes(text) : [],
    textUrl: reg.xmlUrl,
  };
}

/** Longest policy excerpt handed to the model. */
export const MAX_POLICY_CHARS = 12_000;

/**
 * The lines of a policy text that concern housing and carry a number (norms per dwelling, caps, exceptions), with their neighbours,
 * so a long regulation fits in one prompt. Null when nothing like that is found. Exported for tests.
 */
export function housingLines(text: string): string | null {
  const lines = text.split("\n");
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (/woning|wonen|woonfunctie|woongebouw|appartement|huishouden/i.test(l) && (/\d/.test(l) || /parkeernorm/i.test(l))) {
      for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < lines.length) keep.add(j);
    }
  });
  const out = [...keep].sort((a, b) => a - b).map((i) => lines[i]!.trim()).filter(Boolean).join("\n");
  return out ? out.slice(0, MAX_POLICY_CHARS) : null;
}

/** The housing parts of a municipal parking policy as one excerpt for the rule extraction. Only the official repository is fetched. */
export async function fetchPolicyExcerpt(fetchText: TextFetcher, xmlUrl: string): Promise<PlanExcerpt[]> {
  if (!isRegulationXmlUrl(xmlUrl)) return [];
  const text = housingLines(regulationText(await fetchText("cvdr", xmlUrl)));
  const id = /\/(CVDR\d+)\//.exec(xmlUrl)?.[1] ?? "policy";
  return text ? [{ title: `Municipal parking policy (${id}), housing parts`, url: xmlUrl, text }] : [];
}
