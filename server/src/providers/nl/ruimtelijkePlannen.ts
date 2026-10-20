/**
 * Zoning from the public plan viewer ruimtelijkeplannen.nl (Kadaster), no API key. This is the backend that site's own viewer calls,
 * not a documented API, so it can change; probed live on 2026-10-16:
 *   plans at a point   GET https://www.ruimtelijkeplannen.nl/plannenservice/plannen/xy/{x}/{y}   (RD metres)
 *   zoning at a point  GET https://www.ruimtelijkeplannen.nl/web-roo/rest/bestemmplangebied/id/{planId}/xy/{x}/{y}?buffer=1
 * Both need the request header `dummy: dummy` (published in the site's own /assets/config/http-security-header.config.json);
 * without it they answer with the HTML shell. See `RP_HEADERS`, which the JSON fetcher adds for the "rp" provider.
 *
 * Coverage is partial: old plans in the `plangebied_pcp` format have no structured data, umbrella plans return empty zoning, and
 * since the Omgevingswet the rules move to DSO, which this site does not show. Anything not found stays unknown (null, `assumed`).
 * Values are read at ONE point of the plot, which the notes say.
 */
import {
  pointInRing,
  unknownConstraints,
  setField,
  translateFunctions,
  type Constrained,
  type Parcel,
  type Provenance,
  type SiteConstraints,
  type ZoningProvider,
  type ZoningResult,
} from "@massing/shared";
import type { JsonFetcher } from "../../cache/diskCache";
import { MAX_REFS, isPlanTextUrl } from "./planText";

const SITE = "https://www.ruimtelijkeplannen.nl";
const PLANS = `${SITE}/plannenservice/plannen/xy`;
const ZONING = `${SITE}/web-roo/rest`;
export const RP_PROVIDER = "rp";
export const RP_HEADERS = { dummy: "dummy" };

type Pt = [number, number];
type Poly = Pt[][];

type PlanSummary = {
  identificatie: string;
  naam: string;
  datum: string | null;
  planStatus: string | null;
  samengesteldePlanStatus: string | null;
  sourceTable: string;
  typePlan: string;
};

type PlanObject = {
  id?: number | string;
  /** Plan object id, e.g. "NL.IMRO.146"; a maatvoering refers to its bouwvlak by it. */
  identificatie?: string | null;
  /** On a maatvoering: the object it applies to, e.g. "Bouwvlak=NL.IMRO.146". */
  aanduiding?: string | null;
  naam?: string | null;
  geometrie?: string | null;
  maatvoering?: string | null;
  historisch?: boolean;
  verwijzingNaarTekstURL?: string | null;
};

const DETAIL_KEYS = ["enkelBestemmingen", "dubbelBestemmingen", "bouwVlakken", "maatvoeringen", "bouwAanduidingen", "functieAanduidingen", "gebiedsAanduidingen", "lettertekenAanduidingen", "figuren"] as const;
type PlanDetails = Partial<Record<(typeof DETAIL_KEYS)[number], PlanObject[]>>;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Polygons of a WKT `POLYGON ((x y, …), (hole))` or `MULTIPOLYGON (((…)), ((…)))`; anything else gives none. */
export function parseWkt(wkt: string): Poly[] {
  const text = wkt.trim();
  const ring = (s: string): Pt[] =>
    s
      .split(",")
      .map((p) => p.trim().split(/\s+/).map(Number))
      .filter((p) => p.length >= 2 && p.every(Number.isFinite))
      .map((p) => [p[0]!, p[1]!] as Pt);
  const rings = (s: string): Poly => [...s.matchAll(/\(([^()]*)\)/g)].map((m) => ring(m[1]!)).filter((r) => r.length >= 4);
  if (/^POLYGON/i.test(text)) {
    const p = rings(text);
    return p.length ? [p] : [];
  }
  if (/^MULTIPOLYGON/i.test(text)) {
    const body = text.replace(/^MULTIPOLYGON\s*/i, "");
    // split into polygons at the ")), ((" boundaries
    return body
      .slice(1, -1)
      .split(/\)\s*\)\s*,\s*\(\s*\(/)
      .map((chunk) => rings(`((${chunk.replace(/^\(+|\)+$/g, "")}))`))
      .filter((p) => p.length);
  }
  return [];
}

/**
 * The numeric values in a maatvoering string. Usually one pair like `"maximum bouwhoogte (m)"="18"`, but one object can carry
 * several: `"…bebouwingspercentage…"="74", "maximum bouwhoogte (m)"="20", "maximum goothoogte (m)"="20"`. Decimal comma accepted.
 * Each result keeps its own `quote` (`"label"="value"`); non-numeric pairs are skipped.
 */
export function parseMaatvoeringen(raw: string): { label: string; value: number; quote: string }[] {
  const out: { label: string; value: number; quote: string }[] = [];
  for (const m of raw.matchAll(/"([^"]+)"\s*=\s*"\s*([-+]?\d+(?:[.,]\d+)?)\s*"/g)) {
    const value = Number(m[2]!.replace(",", "."));
    if (Number.isFinite(value)) out.push({ label: m[1]!.trim(), value, quote: `"${m[1]!.trim()}"="${m[2]!.trim()}"` });
  }
  return out;
}

/** A point inside the parcel ring (RD): the centroid if it is inside, otherwise the first grid point that is. */
export function pointInside(ring: Pt[]): Pt | null {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const c: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
  if (pointInRing(c, ring)) return c;
  for (let n = 4; n <= 32; n *= 2) {
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        const p: Pt = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
        if (pointInRing(p, ring)) return p;
      }
    }
  }
  return null;
}

/** Points inside the parcel to read the plan at: a central one first, then up to four spread out (skipped when they are within 3 m of one already used). */
export function samplePoints(ring: Pt[]): Pt[] {
  const c = pointInside(ring);
  if (!c) return [];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: Pt[] = [c];
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
    const p: Pt = [x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy];
    if (pointInRing(p, ring) && out.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= 3)) out.push(p);
  }
  return out;
}

/** Zoning details read at several points, one list per kind, each object once (by id). */
export function mergeDetails(list: PlanDetails[]): PlanDetails {
  const out: PlanDetails = {};
  for (const key of DETAIL_KEYS) {
    const seen = new Set<string>();
    out[key] = list.flatMap((d) => d[key] ?? []).filter((o) => {
      const id = String(o.id ?? o.geometrie ?? JSON.stringify(o));
      return seen.has(id) ? false : (seen.add(id), true);
    });
  }
  return out;
}

const usable = (p: PlanSummary) => p.sourceTable === "bestemmplangebied" && ["vastgesteld", "onherroepelijk"].includes(p.samengesteldePlanStatus ?? "");

/** Names of every municipal plan at a point (any status or format), for naming the area the plot lies in. */
export async function planNamesAt(fetchJson: JsonFetcher, at: Pt): Promise<string[]> {
  const body = (await fetchJson(RP_PROVIDER, `${PLANS}/${r2(at[0])}/${r2(at[1])}`)) as { levels?: { levelNaam?: string; soorten?: { plannen?: { naam?: string }[] }[] }[] };
  return (body.levels ?? [])
    .filter((l) => l.levelNaam === "Gemeente")
    .flatMap((l) => l.soorten ?? [])
    .flatMap((s) => s.plannen ?? [])
    .flatMap((p) => (p.naam ? [p.naam] : []));
}

/** Municipal zoning plans (bestemmingsplannen) from the point query, newest first. */
export function municipalPlans(body: unknown): PlanSummary[] {
  const levels = (body as { levels?: { levelNaam?: string; soorten?: { soortNaam?: string; plannen?: PlanSummary[] }[] }[] })?.levels ?? [];
  return levels
    .filter((l) => l.levelNaam === "Gemeente")
    .flatMap((l) => l.soorten ?? [])
    .filter((s) => s.soortNaam === "bestemmingsplannen")
    .flatMap((s) => s.plannen ?? [])
    .filter(usable)
    .sort((a, b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
}

const live = (o: PlanObject) => !o.historisch;
const hasData = (d: PlanDetails) => ["enkelBestemmingen", "bouwVlakken", "maatvoeringen"].some((k) => (d[k as keyof PlanDetails] ?? []).some(live));

/** Pure mapping of one plan's zoning at a point onto SiteConstraints (RD geometry). Unfilled fields stay unknown. */
export function constraintsFromPlan(plan: PlanSummary, d: PlanDetails, at: Pt, others: PlanSummary[] = [], sampled = 1, points: Pt[] = [at]): SiteConstraints {
  const samples = points.length ? points : [at];
  const planUrl = `${SITE}/viewer/plan/${plan.identificatie}`;
  const prov = (status: Provenance["status"], quote?: string, source = planUrl): Provenance => ({
    source: `${plan.naam} (${plan.identificatie}), ${plan.datum ?? "n.d."}, ${source}`,
    ...(quote ? { quote } : {}),
    status,
  });
  let c = unknownConstraints(`No value for this rule in plan ${plan.identificatie} at this point`);
  const put = <T>(path: Parameters<typeof setField>[1], f: Constrained<T>) => {
    c = setField(c, path, f as Constrained<unknown>);
  };
  const notes: Constrained<string>[] = [];
  const note = (text: string, quote?: string) => notes.push({ value: text, prov: prov("extracted", quote) });

  // bestemming: names of the enkelbestemmingen at the point, with the link to the rule text
  const bestemmingen = (d.enkelBestemmingen ?? []).filter(live);
  if (bestemmingen.length) {
    const names = [...new Set(bestemmingen.map((b) => b.naam).filter((n): n is string => !!n))];
    const url = bestemmingen.find((b) => b.verwijzingNaarTekstURL)?.verwijzingNaarTekstURL ?? undefined;
    put("allowedFunctions", { value: translateFunctions(names), prov: prov("extracted", `Enkelbestemming: ${names.join(", ")}`, url ?? planUrl) });
    if (url) note(`Plan rules for the bestemming (read them before relying on the values): ${url}`);
  }
  for (const b of (d.dubbelBestemmingen ?? []).filter(live)) if (b.naam) note(`Dubbelbestemming at this point: ${b.naam}`, b.naam);

  // aanduidingen the generator cannot use but an architect must see (noise zones, pipelines, special building designations)
  const aanduidingen: [string, PlanObject[] | undefined][] = [
    ["Building designation (bouwaanduiding)", d.bouwAanduidingen],
    ["Function designation (functieaanduiding)", d.functieAanduidingen],
    ["Area designation (gebiedsaanduiding)", d.gebiedsAanduidingen],
    ["Figure on the plan map", d.figuren],
  ];
  for (const [kind, objs] of aanduidingen) {
    for (const naam of new Set((objs ?? []).filter(live).map((o) => o.naam).filter((n): n is string => !!n))) note(`${kind} on the plot: ${naam}`, naam);
  }

  // bouwvlak: the polygon containing the point, else the largest one found on the plot
  const vlakken = (d.bouwVlakken ?? []).filter(live).flatMap((v) => parseWkt(v.geometrie ?? "").map((poly) => ({ poly, ident: v.identificatie ?? null })));
  const area = (p: Poly) => Math.abs(p[0]!.reduce((s, [x, y], i, r) => s + (r[(i + 1) % r.length]![0] - x) * (r[(i + 1) % r.length]![1] + y), 0)) / 2;
  // the bouwvlak that holds most of the sample points; ties and plots with none inside go to the larger one
  const hits = (v: { poly: Poly }) => samples.filter((p) => pointInRing(p, v.poly[0]!)).length;
  const main = [...vlakken].sort((a, b) => hits(b) - hits(a) || area(b.poly) - area(a.poly))[0];
  if (main) put("bouwvlak", { value: { type: "Polygon", coordinates: main.poly.map((r) => r.map(([x, y]) => [r2(x), r2(y)] as Pt)) }, prov: prov("extracted", "bouwvlak") });
  if (vlakken.length > 1) note(`The plot touches ${vlakken.length} bouwvlakken; the one used is the one that holds most of the sampled points`);

  // maatvoering: height, gutter height, coverage; anything else is shown as a note.
  // A maatvoering names the bouwvlak it belongs to ("Bouwvlak=<id>"): only those of the chosen bouwvlak count, plus plan-wide ones.
  const belongsElsewhere = (m: PlanObject) => {
    const ref = /Bouwvlak=([^,\s]+)/.exec(m.aanduiding ?? "")?.[1];
    return !!ref && !!main?.ident && ref !== main.ident;
  };
  const maatvoeringen = (d.maatvoeringen ?? []).filter(live);
  const elsewhere = maatvoeringen.filter(belongsElsewhere);
  if (elsewhere.length) note(`Other bouwvlakken on or near the plot have their own maatvoering, not used here: ${elsewhere.map((m) => m.maatvoering ?? m.naam ?? "").join("; ")}`);
  const found: Record<"height" | "gutter" | "coverage", { value: number; raw: string }[]> = { height: [], gutter: [], coverage: [] };
  for (const m of maatvoeringen.filter((m) => !belongsElsewhere(m))) {
    const raw = m.maatvoering ?? "";
    const pairs = parseMaatvoeringen(raw);
    if (!pairs.length && raw) note(`Maatvoering the generator cannot use: ${raw}`, raw);
    for (const p of pairs) {
      const label = p.label.toLowerCase();
      const raw = p.quote;
      if (/goothoogte/.test(label) && /max/.test(label)) found.gutter.push({ value: p.value, raw });
      else if (/bouwhoogte/.test(label) && /max/.test(label)) found.height.push({ value: p.value, raw });
      else if (/bebouwingspercentage/.test(label) && /max/.test(label)) found.coverage.push({ value: p.value / 100, raw });
      else note(`Maatvoering the generator cannot use: ${raw}`, raw);
    }
  }
  const lowest = (xs: { value: number; raw: string }[]) => xs.reduce((a, b) => (b.value < a.value ? b : a));
  const setMax = (path: "maxHeight" | "maxGutterHeight" | "maxCoverage", xs: { value: number; raw: string }[], unit?: string) => {
    if (!xs.length) return;
    const best = lowest(xs);
    put(path, { value: best.value, ...(unit ? { unit } : {}), prov: prov("extracted", best.raw) });
    if (xs.length > 1) note(`Several values for ${path} at this point (${xs.map((x) => x.raw).join("; ")}); the lowest is used`);
  };
  setMax("maxHeight", found.height, "m");
  setMax("maxGutterHeight", found.gutter, "m");
  setMax("maxCoverage", found.coverage);

  note(`Rules were read at ${sampled} point${sampled === 1 ? "" : "s"} of the plot, from a public viewer that can be incomplete or outdated; check the plan before relying on them.`);
  if (others.length) note(`Other plans also cover this point: ${others.map((p) => `${p.naam} (${p.identificatie})`).join("; ")}`);
  return { ...c, notes };
}

/** Links to the rule text of the enkelbestemmingen at the point (one per distinct page + anchor), for the AI rule extraction. */
export function textRefsFor(plan: PlanSummary, d: PlanDetails): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const b of (d.enkelBestemmingen ?? []).filter(live)) {
    const url = b.verwijzingNaarTekstURL;
    if (!url || seen.has(url) || !isPlanTextUrl(url.split("#")[0]!)) continue;
    seen.add(url);
    out.push({ title: `${b.naam ?? "Bestemming"}, ${plan.naam} (${plan.identificatie})`, url });
  }
  return out.slice(0, MAX_REFS);
}

export class RuimtelijkePlannenZoningProvider implements ZoningProvider {
  constructor(private readonly fetchJson: JsonFetcher) {}

  async constraintsFor(parcel: Parcel): Promise<ZoningResult | null> {
    const points = samplePoints(parcel.ring).map((p) => [r2(p[0]), r2(p[1])] as Pt);
    if (!points.length) return null;
    const at = points[0]!;
    const plans = municipalPlans(await this.fetchJson(RP_PROVIDER, `${PLANS}/${at[0]}/${at[1]}`));
    for (const plan of plans) {
      const id = encodeURIComponent(plan.identificatie);
      const reads = await Promise.all(
        points.map((p) => this.fetchJson(RP_PROVIDER, `${ZONING}/bestemmplangebied/id/${id}/xy/${p[0]}/${p[1]}?buffer=1`) as Promise<PlanDetails>),
      );
      const details = mergeDetails(reads);
      if (!hasData(details)) continue;
      const others = plans.filter((p) => p !== plan);
      return {
        fixtureId: `ruimtelijkeplannen:${plan.identificatie}`,
        label: `Live plan data: ruimtelijkeplannen.nl, ${plan.naam} (${plan.identificatie}), read at ${points.length} point${points.length === 1 ? "" : "s"} of the plot`,
        constraints: constraintsFromPlan(plan, details, at, others, points.length, points),
        textRefs: textRefsFor(plan, details),
      };
    }
    return null;
  }
}
