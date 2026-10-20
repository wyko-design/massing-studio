/**
 * Things that limit building on a plot but are not in the zoning plan, from open PDOK layers. Each becomes a note the user must see;
 * none of them changes a number the generator uses. Layers and field names verified live on 2026-10-16:
 *   Heritage   https://api.pdok.nl/rce/beschermde-gebieden-cultuurhistorie/ogc/v1  rce_inspire_polygons  (text, legalfoundationdate, namespace, ci_citation)
 *   Wkpb       https://api.pdok.nl/kadaster/brk-publiekrechtelijke-beperkingen-wkpb/ogc/v1  pb_multipolygon  (naam_groep, grondslag_omschrijving, monumentnummer, datum_beeindiging)
 *   Foundation https://api.pdok.nl/rvo/indicatieve-aandachtsgebieden-funderingsproblematiek/ogc/v1  indgebfunderingsproblematiek  (legenda, pc6, fgr, percvoor1970)
 * A layer that fails or has nothing at the point adds nothing; the others still count.
 */
import type { Constrained } from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";

const RD = "http://www.opengis.net/def/crs/EPSG/0/28992";
const LAYERS = {
  heritage: "https://api.pdok.nl/rce/beschermde-gebieden-cultuurhistorie/ogc/v1/collections/rce_inspire_polygons",
  wkpb: "https://api.pdok.nl/kadaster/brk-publiekrechtelijke-beperkingen-wkpb/ogc/v1/collections/pb_multipolygon",
  foundation: "https://api.pdok.nl/rvo/indicatieve-aandachtsgebieden-funderingsproblematiek/ogc/v1/collections/indgebfunderingsproblematiek",
} as const;

type Props = Record<string, unknown>;
type Pt = [number, number];

/** Items of a collection that touch a 2 m box around the point (RD). */
export function itemsUrl(collection: string, [x, y]: Pt): string {
  const r = 1;
  const q = new URLSearchParams({
    f: "json",
    limit: "20",
    bbox: [x - r, y - r, x + r, y + r].map((v) => Math.round(v * 100) / 100).join(","),
    "bbox-crs": RD,
    crs: RD,
  });
  return `${collection}/items?${q}`;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const unique = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

const note = (text: string, source: string, quote: string): Constrained<string> => ({ value: text, prov: { source, quote, status: "extracted" } });

/** Pure mapping of one layer's properties to notes. Exported for tests. */
export function heritageNotes(items: Props[]): Constrained<string>[] {
  return unique(items, (p) => str(p.localid) || str(p.text)).flatMap((p) => {
    const name = str(p.text);
    if (!name) return [];
    const kind = str(p.namespace).includes("stadsendorpsgezichten") ? "Protected townscape or village view (beschermd stads- of dorpsgezicht)" : "Protected heritage area";
    const since = str(p.legalfoundationdate);
    return [note(`${kind}: ${name}${since ? `, designated ${since}` : ""}. Building changes usually need heritage advice.`, str(p.ci_citation) || LAYERS.heritage, name)];
  });
}

export function wkpbNotes(items: Props[]): Constrained<string>[] {
  return unique(
    items.filter((p) => !p.datum_beeindiging),
    (p) => str(p.identificatie) || str(p.external_fid),
  ).flatMap((p) => {
    const basis = str(p.grondslag_omschrijving);
    if (!basis) return [];
    const nr = str(p.monumentnummer);
    return [note(`Public-law restriction registered on the parcel (Wkpb, ${str(p.naam_groep) || "restriction"}): ${basis}${nr ? ` (monument number ${nr})` : ""}`, LAYERS.wkpb, basis)];
  });
}

export function foundationNotes(items: Props[]): Constrained<string>[] {
  return unique(items, (p) => str(p.pc6)).flatMap((p) => {
    const legend = str(p.legenda);
    if (!legend) return [];
    const pct = Number(str(p.percvoor1970));
    const share = str(p.percvoor1970) && Number.isFinite(pct) ? String(Math.round(pct)) : "";
    return [
      note(
        `Foundation risk attention area (postcode ${str(p.pc6)}${str(p.fgr) ? `, ${str(p.fgr)}` : ""}): ${legend}${share ? `; ${share}% of the buildings there were built before 1970` : ""}. Indicative only; check the soil and foundation situation.`,
        LAYERS.foundation,
        legend,
      ),
    ];
  });
}

async function items(fetchJson: JsonFetcher, collection: string, at: Pt): Promise<Props[]> {
  const body = (await fetchJson("pdok", itemsUrl(collection, at))) as { features?: { properties?: Props }[] };
  return (body.features ?? []).flatMap((f) => (f.properties ? [f.properties] : []));
}

/** Notes about heritage, public-law restrictions and foundation risk at a point (RD metres). */
export async function restrictionNotes(fetchJson: JsonFetcher, at: Pt): Promise<Constrained<string>[]> {
  const jobs: [string, (p: Props[]) => Constrained<string>[]][] = [
    [LAYERS.heritage, heritageNotes],
    [LAYERS.wkpb, wkpbNotes],
    [LAYERS.foundation, foundationNotes],
  ];
  const settled = await Promise.allSettled(jobs.map(async ([url, map]) => map(await items(fetchJson, url, at))));
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
