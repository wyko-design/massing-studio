/**
 * Plan rule text from ruimtelijkeplannen.nl (the `verwijzingNaarTekstURL` of an enkelbestemming), cleaned to plain text for the
 * constraint interpreter. Verified live on 2026-10-16: these are static XHTML pages, no header needed. Two layouts exist:
 *   IMRO2008  one small page per article             .../r_<plan>_2.5.html
 *   IMRO2012  one big document, article by anchor    .../r_<plan>.html#_15_Wonen  (the anchor is an element id)
 * For the second kind only the anchored article is kept, not the table of contents or the other articles.
 */
import type { PlanExcerpt } from "@massing/shared";

export type PlanTextRef = { title: string; url: string };

/** Per excerpt, so one prompt stays within a sensible size. */
export const MAX_EXCERPT_CHARS = 14_000;
export const MAX_REFS = 3;
/** General-rules articles read per plan, and the length of each. */
export const MAX_GENERAL = 4;
export const MAX_GENERAL_CHARS = 10_000;

/** General articles that can hold rules for any bestemming (measuring, building, designations, deviations). Begrippen is left out: long, no rules. */
const GENERAL = /(algemene\s*bouwregels|algemene\s*afwijkingsregels|algemene\s*aanduidingsregels|wijze\s*van\s*meten)/i;

const HOSTS = new Set(["ruimtelijkeplannen.nl", "www.ruimtelijkeplannen.nl"]);

/** Only plan documents on ruimtelijkeplannen.nl are fetched (the client sends the links, so they are checked). */
export function isPlanTextUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.has(u.hostname) && /^\/documents\/[^/]+\/r_[^/]+\.html$/.test(u.pathname);
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", sup2: "²", sup3: "³", eacute: "é", euml: "ë", ouml: "ö" };

export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Plain text of an HTML fragment: block elements become line breaks, everything else is dropped. */
export function htmlToText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return decode(
    body
      .replace(/<(script|style|nav)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|tr|h[1-6]|table|ul|ol|dt|dd|section|article)>|<br\s*\/?>/gi, "\n")
      .replace(/<\/t[dh]>/gi, " | ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The HTML of one article of a single-document plan: from the element with `id="<anchor>"` to the next article heading. */
export function articleHtml(html: string, anchor: string): string | null {
  const at = html.search(new RegExp(`id="${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  if (at < 0) return null;
  // start at the `<` of the element that carries the id, and stop at the `<` of the next article's element
  const start = html.lastIndexOf("<", at);
  const next = html.slice(at + 1).search(/id="_\d+_[^"]*"/);
  const end = next < 0 ? html.length : html.lastIndexOf("<", at + 1 + next);
  return html.slice(start, end);
}

/** Cleaned text for one plan-text link, cut to the anchored article when there is an anchor. Null when nothing readable is left. */
export function planTextFrom(html: string, anchor: string | null, max = MAX_EXCERPT_CHARS): string | null {
  const part = anchor ? articleHtml(html, anchor) : html;
  if (!part) return null;
  const text = htmlToText(part);
  return text.length >= 40 ? text.slice(0, max) : null;
}

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Links to the general articles of the plan that a bestemming article belongs to.
 *   IMRO2012: anchors in the same document (id "_25_Algemenebouwregels"), read from the page that was already fetched.
 *   IMRO2008: the chapter pages ..._1.html and ..._3.html list the articles as links; both are fetched.
 */
export async function generalRefs(fetchText: TextFetcher, ref: PlanTextRef, page: string, html: string): Promise<PlanTextRef[]> {
  const plan = /\/documents\/([^/]+)\//.exec(page)?.[1] ?? "plan";
  const out: PlanTextRef[] = [];
  if (ref.url.includes("#")) {
    for (const m of html.matchAll(/id="(_\d+_[^"]*)"/g)) {
      const name = m[1]!.replace(/^_\d+_/, "");
      if (GENERAL.test(name)) out.push({ title: `${name}, ${plan}`, url: `${page}#${m[1]}` });
    }
  } else {
    const base = page.replace(/_[\d.]+\.html$/, "");
    for (const chapter of [1, 3]) {
      let list: string;
      try {
        list = await fetchText("rp-text", `${base}_${chapter}.html`);
      } catch {
        continue;
      }
      for (const m of list.matchAll(/<a[^>]*href="([^"#]+\.html)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const text = clean(m[2]!);
        if (/^artikel/i.test(text) && GENERAL.test(text)) out.push({ title: `${text}, ${plan}`, url: new URL(m[1]!, page).toString() });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true))).slice(0, MAX_GENERAL);
}

export type TextFetcher = (provider: string, url: string) => Promise<string>;

/**
 * Links to excerpts: fetches each distinct page once, so two articles of one document share one download.
 * With `general`, the general-rules articles of the first link's plan are read as well (they come after the bestemming articles).
 */
export async function fetchPlanExcerpts(fetchText: TextFetcher, refs: PlanTextRef[], opts: { general?: boolean } = {}): Promise<PlanExcerpt[]> {
  const pages = new Map<string, Promise<string>>();
  const page = (url: string) => {
    if (!pages.has(url)) pages.set(url, fetchText("rp-text", url));
    return pages.get(url)!;
  };
  const out: PlanExcerpt[] = [];
  const add = async (ref: PlanTextRef, max = MAX_EXCERPT_CHARS) => {
    const [p, anchor = null] = ref.url.split("#") as [string, string?];
    const text = planTextFrom(await page(p), anchor, max);
    if (text) out.push({ title: ref.title, url: ref.url, text });
  };
  const valid = refs.filter((r) => isPlanTextUrl(r.url.split("#")[0]!)).slice(0, MAX_REFS);
  for (const ref of valid) await add(ref);
  if (opts.general && valid[0]) {
    const [p] = valid[0].url.split("#") as [string];
    let extra: PlanTextRef[] = [];
    try {
      extra = await generalRefs(fetchText, valid[0], p, await page(p));
    } catch {
      // general articles are a bonus: the bestemming text alone still works
    }
    for (const ref of extra.filter((r) => isPlanTextUrl(r.url.split("#")[0]!))) {
      try {
        await add(ref, MAX_GENERAL_CHARS);
      } catch {
        // skip an unreadable page
      }
    }
  }
  return out;
}
