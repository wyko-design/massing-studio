/**
 * Country name matching for the landing input: exact name → alias → unique prefix → small typo.
 * Pure: entries come from countries/index.ts (world-atlas ids + i18n-iso-countries names).
 */

export type CountryEntry = {
  /** world-atlas feature key: ISO 3166-1 numeric id, or "name:<name>" for features without one. */
  id: string;
  /** English display name. */
  name: string;
  alpha2: string | null;
  /** Official and common names (en, nl, pl). The first one is the display name. */
  names: string[];
  /** Informal names (Holland, UK, USA…). */
  aliases: string[];
  /** Likelihood order for ambiguous input (lower = more likely), e.g. cities by population. Else the `popular` list decides. */
  rank?: number;
};

export type MatchKind = "exact" | "alias" | "prefix" | "typo";

export type CountryMatch = {
  entry: CountryEntry;
  kind: MatchKind;
  /** The name or alias that matched, as written in the data. */
  matched: string;
};

/** What the input proposes for the text typed so far. */
export type Suggestion = {
  entry: CountryEntry;
  /** "complete": the input is the start of `name`; "fix": the input looks like a misspelling of `name`. */
  kind: "complete" | "fix";
  /** The proper, capitalised name. */
  name: string;
  /** For "complete": the text to append to what was typed (empty when it is already the full name). */
  rest: string;
};

export type Matcher = {
  match: (input: string) => CountryMatch | null;
  /** The most likely country for the input: aggressive (from the first letter, also for misspellings). */
  suggest: (input: string) => Suggestion | null;
  /** Text to show after the typed input as a ghost completion ("" when there is none). */
  ghost: (input: string) => string;
};

/** Max edit distance accepted as a typo, and the shortest input it applies to. */
export const TYPO_MAX = 2;
export const TYPO_MIN_LENGTH = 4;

/** Lowercase, no diacritics, punctuation → space, single spaces. "Côte d'Ivoire" → "cote d ivoire". */
export function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      cur[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j]!;
    prev = cur;
  }
  return prev[b.length]!;
}

type Name = { norm: string; text: string; entry: CountryEntry; alias: boolean };

/** One entry if all candidates point to the same country, else null. */
function unique(cands: Name[]): CountryEntry | null {
  const first = cands[0]?.entry;
  return first && cands.every((c) => c.entry === first) ? first : null;
}

const shortest = (cands: Name[]) => cands.reduce((a, b) => (b.text.length < a.text.length ? b : a));

export function createMatcher(entries: CountryEntry[], popular: string[] = []): Matcher {
  const rank = (e: CountryEntry) => {
    if (e.rank !== undefined) return e.rank;
    const i = e.alpha2 ? popular.indexOf(e.alpha2) : -1;
    return i < 0 ? popular.length : i;
  };
  const names: Name[] = [];
  for (const entry of entries) {
    for (const text of entry.names) names.push({ norm: normalise(text), text, entry, alias: false });
    for (const text of entry.aliases) names.push({ norm: normalise(text), text, entry, alias: true });
  }
  const real = names.filter((n) => n.norm);

  const prefixed = (n: string) => real.filter((c) => c.norm.startsWith(n));

  const match = (input: string): CountryMatch | null => {
    const n = normalise(input);
    if (!n) return null;

    const exact = real.filter((c) => c.norm === n);
    const official = exact.filter((c) => !c.alias);
    if (official.length) {
      // "Congo" is an alternative name of both Congos: only accept it if one of them uses it as display name
      const entry = unique(official) ?? unique(official.filter((c) => c.entry.names[0] === c.text));
      if (entry) return { entry, kind: "exact", matched: official.find((c) => c.entry === entry)!.text };
    }
    const alias = unique(exact);
    if (alias) return { entry: alias, kind: "alias", matched: exact[0]!.text };

    const pre = prefixed(n);
    const preEntry = unique(pre);
    if (preEntry) return { entry: preEntry, kind: "prefix", matched: shortest(pre).text };

    if (n.length >= TYPO_MIN_LENGTH && !pre.length) {
      let best = TYPO_MAX + 1;
      let cands: Name[] = [];
      for (const c of real) {
        const d = editDistance(n, c.norm, best);
        if (d < best) [best, cands] = [d, [c]];
        else if (d === best) cands.push(c);
      }
      const entry = best <= TYPO_MAX ? unique(cands) : null;
      if (entry) return { entry, kind: "typo", matched: cands[0]!.text };
    }
    return null;
  };

  /** Best candidate: most popular country, then an official name over an alias, then the shortest name. */
  const best = (cands: Name[]) =>
    cands.reduce((a, b) => {
      // the English display name first, then the more popular country, then official over alias, then shorter
      const da = a.entry.names[0] === a.text;
      const db = b.entry.names[0] === b.text;
      if (da !== db) return db ? b : a;
      const ra = rank(a.entry);
      const rb = rank(b.entry);
      if (ra !== rb) return rb < ra ? b : a;
      if (a.alias !== b.alias) return b.alias ? a : b;
      return b.text.length < a.text.length ? b : a;
    });

  const suggest = (input: string): Suggestion | null => {
    const n = normalise(input);
    if (!n) return null;
    const pre = prefixed(n);
    if (pre.length) {
      const top = best(pre);
      // smallest leading slice of the name that normalises to the input, so diacritics and case line up
      for (let k = 1; k <= top.text.length; k++) {
        if (normalise(top.text.slice(0, k)) === n) {
          const rest = top.text.slice(k);
          return { entry: top.entry, kind: "complete", name: top.text, rest: /\s$/.test(input) ? rest.replace(/^\s+/, "") : rest };
        }
      }
      return null;
    }
    // misspelling: the closest names, then the most popular of them
    if (n.length >= 3) {
      const max = n.length <= 4 ? 1 : TYPO_MAX;
      let bestD = max + 1;
      let cands: Name[] = [];
      for (const c of real) {
        const d = editDistance(n, c.norm, bestD);
        if (d < bestD) [bestD, cands] = [d, [c]];
        else if (d === bestD) cands.push(c);
      }
      if (bestD <= max) {
        const top = best(cands);
        return { entry: top.entry, kind: "fix", name: top.text, rest: "" };
      }
    }
    return null;
  };

  const ghost = (input: string): string => {
    const s = suggest(input);
    return s?.kind === "complete" ? s.rest : "";
  };

  return { match, suggest, ghost };
}
