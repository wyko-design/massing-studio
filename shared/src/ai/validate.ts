/** Model prose may not carry numbers: every number the user sees comes from code (SPEC §7). */
export const hasDigits = (text: string): boolean => /\d/.test(text);

/** One error per text that contains a digit, naming where it was. */
export function digitErrors(texts: { where: string; text: string }[]): string[] {
  return texts
    .filter((t) => hasDigits(t.text))
    .map((t) => `${t.where} contains a number ("${t.text}"). Write it without digits; the app shows computed numbers itself.`);
}

/** Lower case, unified quotes and dashes, collapsed whitespace: for verbatim-quote checks. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `quote` appears in `source` (whitespace, case and typographic quotes ignored). */
export const isVerbatim = (quote: string, source: string): boolean => {
  const q = normaliseText(quote);
  return q.length > 0 && normaliseText(source).includes(q);
};

/** Numbers written in a text, Dutch or English decimals ("2,5" and "2.5" both read as 2.5). */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));
}

/** True when `value` is written in `quote`, directly or as a percentage (0.6 ↔ "60%"). */
export function quoteStatesValue(quote: string, value: number): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return numbersIn(quote).some((n) => close(n, value) || close(n / 100, value));
}
