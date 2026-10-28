import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ReportModel, ReportOption } from "./model";
import { TOKENS } from "../landing/tokens";

/** Rendered images for the report as JPEG bytes (square, the studio's view). */
export type ReportImages = { cover: Uint8Array; options: Uint8Array[] };
/** IBM Plex Mono as TTF (fonts/), the tool's type. */
export type ReportFonts = { regular: Uint8Array; semibold: Uint8Array };

/*
 * The tool's design language on A4: the page grid (background with its grid lines), white windows with stroke lines
 * on the grid, IBM Plex Mono, the blue logo block, and blue only for what needs attention. One grid cell is 16 pt,
 * the studio's 32 px cell at half size; every window, row and line sits on the grid.
 */
const A4: [number, number] = [595.28, 841.89];
const C = 16;
const COLS = 37;
const ROWS = 52;
const OX = (A4[0] - COLS * C) / 2;
const OY = (A4[1] - ROWS * C) / 2;
/** Content columns (33 cells) and the last row a window may reach; the footer sits below it. */
const L = 2;
const R = 35;
const LAST = 48;
const PAD = 8;
const LINE = 0.6;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex(TOKENS.black);
const STROKE = hex(TOKENS.stroke);
const BLUE = hex(TOKENS.blue);
const WHITE = hex(TOKENS.white);
const BACKGROUND = hex(TOKENS.background);
const GRID = hex(TOKENS.gridLine);
const MUTED = hex("#8C8C8C");
/** The grey of a met rule's tag in the studio (studio.css .rules-tag.pass). */
const CHIP = hex("#D8D8D8");

const gx = (col: number) => OX + col * C;
/** The top edge of a grid row, in PDF coordinates (origin bottom left). */
const gy = (row: number) => A4[1] - OY - row * C;

/** Characters the font lacks, written the long way. */
const REPLACEMENTS: Record<string, string> = { "≤": "<=", "≥": ">=", "→": "->", "−": "-", "≈": "~", "‑": "-", "…": "...", "✓": "", "✕": "x" };

type TextOpts = { size?: number; font?: PDFFont; colour?: ReturnType<typeof rgb> };

class Doc {
  pages: PDFPage[] = [];
  page!: PDFPage;
  /** The next free grid row on this page. */
  row = 0;
  private readonly chars: Map<PDFFont, Set<number>> = new Map();

  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly semibold: PDFFont,
    readonly model: ReportModel,
  ) {}

  /** A page: background, grid lines and (after the first) a one-row logo with the section's name. */
  newPage(section?: string) {
    this.page = this.pdf.addPage(A4);
    this.pages.push(this.page);
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: BACKGROUND });
    for (let c = 0; c <= COLS; c++) this.page.drawLine({ start: { x: gx(c), y: gy(0) }, end: { x: gx(c), y: gy(ROWS) }, thickness: 0.4, color: GRID });
    for (let r = 0; r <= ROWS; r++) this.page.drawLine({ start: { x: gx(0), y: gy(r) }, end: { x: gx(COLS), y: gy(r) }, thickness: 0.4, color: GRID });
    if (section) {
      this.page.drawRectangle({ x: gx(L), y: gy(3), width: 6 * C, height: C, color: BLUE });
      this.text("MASSING STUDIO", gx(L) + PAD, this.middle(2, 1, 6.5), { size: 6.5, font: this.semibold, colour: WHITE });
      this.text(section.toUpperCase(), gx(L + 6) + PAD, this.middle(2, 1, 7), { size: 7, colour: MUTED });
      this.text(this.model.address, gx(R) - PAD, this.middle(2, 1, 7), { size: 7, colour: MUTED, align: "right" });
      this.row = 4;
    }
  }

  /** Moves to a new page when `rows` do not fit below the current row. */
  fit(rows: number, section: string) {
    if (this.row + rows > LAST) this.newPage(section);
  }

  safe(text: string, font: PDFFont): string {
    let set = this.chars.get(font);
    if (!set) this.chars.set(font, (set = new Set(font.getCharacterSet())));
    let out = "";
    for (const ch of text) {
      if (set.has(ch.codePointAt(0)!)) out += ch;
      else for (const c of REPLACEMENTS[ch] ?? "?") out += set.has(c.codePointAt(0)!) ? c : "?";
    }
    return out;
  }

  width(text: string, font: PDFFont, size: number) {
    return font.widthOfTextAtSize(this.safe(text, font), size);
  }

  /** Text cut to a width, with "..." where it was cut. */
  cut(text: string, font: PDFFont, size: number, width: number): string {
    const s = this.safe(text, font);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    let n = s.length;
    while (n > 0 && font.widthOfTextAtSize(`${s.slice(0, n).trimEnd()}...`, size) > width) n--;
    return `${s.slice(0, n).trimEnd()}...`;
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of this.safe(text, font).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) lines.push(line);
          line = font.widthOfTextAtSize(word, size) <= width ? word : this.cut(word, font, size, width);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Baseline of a line of type centred in `rows` grid rows from `row`. */
  middle(row: number, rows: number, size: number) {
    return gy(row) - (rows * C) / 2 - size * 0.35;
  }

  text(text: string, x: number, baseline: number, o: TextOpts & { align?: "left" | "right" } = {}) {
    const size = o.size ?? 7;
    const font = o.font ?? this.regular;
    const s = this.safe(text, font);
    const left = o.align === "right" ? x - font.widthOfTextAtSize(s, size) : x;
    this.page.drawText(s, { x: left, y: baseline, size, font, color: o.colour ?? INK });
  }

  window(col: number, row: number, cols: number, rows: number) {
    this.page.drawRectangle({ x: gx(col), y: gy(row + rows), width: cols * C, height: rows * C, color: WHITE, borderColor: STROKE, borderWidth: LINE });
  }

  hline(row: number, from = L, to = R) {
    this.page.drawLine({ start: { x: gx(from), y: gy(row) }, end: { x: gx(to), y: gy(row) }, thickness: LINE, color: STROKE });
  }

  vline(col: number, from: number, to: number) {
    this.page.drawLine({ start: { x: gx(col), y: gy(from) }, end: { x: gx(col), y: gy(to) }, thickness: LINE, color: STROKE });
  }

  /** A tag as the studio's: a filled box one half cell high, caps. */
  chip(text: string, right: number, row: number, rows: number, fill: ReturnType<typeof rgb>, colour: ReturnType<typeof rgb>) {
    const size = 6;
    const w = this.width(text, this.semibold, size) + 8;
    const top = gy(row) - (rows * C) / 2 + 5;
    this.page.drawRectangle({ x: right - w, y: top - 10, width: w, height: 10, color: fill });
    this.text(text, right - w + 4, top - 7.2, { size, font: this.semibold, colour });
  }

  /** A window header: two rows with the title in caps, closed by a line. */
  header(title: string, row: number) {
    this.text(title.toUpperCase(), gx(L) + PAD, this.middle(row, 2, 8), { size: 8, font: this.semibold });
    this.hline(row + 2);
  }

  /** A square render in a square of cells, enlarged `zoom` times about its centre and cut to the square. */
  image(img: PDFImage, col: number, row: number, cells: number, zoom = 1) {
    const [x, y, s] = [gx(col), gy(row + cells), cells * C];
    this.page.pushOperators(pushGraphicsState(), rectangle(x, y, s, s), clip(), endPath());
    this.page.drawImage(img, { x: x - (s * (zoom - 1)) / 2, y: y - (s * (zoom - 1)) / 2, width: s * zoom, height: s * zoom });
    this.page.pushOperators(popGraphicsState());
  }

  /**
   * A window of running text (notes, the narrative): header, then paragraphs at `leading`; continues on the next page
   * when it does not fit.
   */
  textWindow(title: string, paragraphs: { text: string; bold?: boolean; bullet?: boolean }[], section: string, leading = 11) {
    const size = 7;
    // a bold paragraph (a section title) after the first opens with half a line of space; a bullet's first line gets a dash
    const lines = paragraphs.flatMap((p, i) =>
      this.wrap(p.text, p.bold ? this.semibold : this.regular, size, (R - L) * C - 2 * PAD - (p.bullet ? 10 : 0)).map((text, k) => ({
        text,
        bold: !!p.bold,
        indent: p.bullet ? 10 : 0,
        dash: k === 0 && !!p.bullet,
        space: (k === 0 && i > 0 && p.bold ? leading / 2 : 0) + leading,
      })),
    );
    let first = true;
    while (lines.length) {
      const room = (LAST - this.row - 2) * C - 2 * PAD;
      if (room < 2 * leading) {
        this.newPage(section);
        continue;
      }
      const take: typeof lines = [];
      let used = 0;
      while (lines.length && used + lines[0]!.space <= room) {
        used += lines[0]!.space;
        take.push(lines.shift()!);
      }
      const rows = 2 + Math.ceil((used + 2 * PAD) / C);
      this.window(L, this.row, R - L, rows);
      this.header(first ? title : `${title} (continued)`, this.row);
      let y = gy(this.row + 2) - PAD;
      for (const l of take) {
        y -= l.space;
        const baseline = y + leading * 0.3;
        if (l.dash) this.text("-", gx(L) + PAD, baseline, { size, colour: MUTED });
        this.text(l.text, gx(L) + PAD + l.indent, baseline, { size, font: l.bold ? this.semibold : this.regular });
      }
      this.row += rows + 1;
      first = false;
      if (lines.length) this.newPage(section);
    }
  }

  /** Footer on every page: address and disclaimer, page number. */
  footer() {
    const total = this.pages.length;
    this.pages.forEach((page, i) => {
      this.page = page;
      const baseline = gy(LAST + 1) - 10;
      this.text(this.cut(`${this.model.address} · ${this.model.disclaimer}`, this.regular, 6, (R - L - 4) * C), gx(L), baseline, { size: 6, colour: MUTED });
      this.text(`${i + 1} / ${total}`, gx(R), baseline, { size: 6, colour: MUTED, align: "right" });
    });
  }
}

/** First page: logo, the site in a window, the view of the option on screen. */
async function cover(d: Doc, image: Uint8Array) {
  const m = d.model;
  d.newPage();
  d.page.drawRectangle({ x: gx(L), y: gy(4), width: 6 * C, height: 2 * C, color: BLUE });
  d.text("MASSING", gx(L) + PAD, gy(2) - 13, { size: 7.5, font: d.semibold, colour: WHITE });
  d.text("STUDIO", gx(L) + PAD, gy(2) - 23, { size: 7.5, font: d.semibold, colour: WHITE });
  d.text(m.title.toUpperCase(), gx(R), d.middle(2, 1, 7), { size: 7, colour: MUTED, align: "right" });
  d.text(m.date, gx(R), d.middle(3, 1, 7), { size: 7, colour: MUTED, align: "right" });

  const top = 5;
  const rows = 2 + m.site.length;
  d.window(L, top, R - L, rows);
  d.text(d.cut(m.address, d.semibold, 12, (R - L) * C - 2 * PAD), gx(L) + PAD, d.middle(top, 2, 12), { size: 12, font: d.semibold });
  d.hline(top + 2);
  m.site.forEach(([k, v], i) => {
    const row = top + 2 + i;
    if (i) d.hline(row);
    d.text(k, gx(L) + PAD, d.middle(row, 1, 7), { colour: MUTED });
    d.text(d.cut(v, d.regular, 7, (R - L - 8) * C - 2 * PAD), gx(L + 8) + PAD, d.middle(row, 1, 7));
  });
  d.vline(L + 8, top + 2, top + rows);

  const img = top + rows + 1;
  const cells = Math.min(R - L, LAST - img);
  const col = L + Math.floor((R - L - cells) / 2);
  d.window(col, img, cells, cells);
  d.image(await d.pdf.embedJpg(image), col, img, cells, 1.25);
}

/** One option as the studio's option panel: image, name and rules chip, the numbers in pairs, trade-offs. */
async function option(d: Doc, o: ReportOption, image: Uint8Array) {
  const H = 8;
  d.fit(H, "Options");
  const r = d.row;
  const split = L + H;
  d.window(L, r, R - L, H);
  d.image(await d.pdf.embedJpg(image), L, r, H, 2);
  d.vline(split, r, r + H);

  d.text(d.cut(o.name, d.semibold, 9, 14 * C), gx(split) + PAD, d.middle(r, 2, 9), { size: 9, font: d.semibold });
  if (o.failed) d.chip(`${o.failed} ${o.failed === 1 ? "RULE" : "RULES"} NOT MET`, gx(R) - PAD, r, 2, BLUE, WHITE);
  else d.chip("RULES MET", gx(R) - PAD, r, 2, CHIP, INK);
  d.hline(r + 2, split);

  const half = split + Math.floor((R - split) / 2);
  for (let k = 0; k < 4; k++) {
    const row = r + 2 + k;
    if (k) d.hline(row, split);
    for (const [i, from] of [split, half].entries()) {
      const pair = o.metrics[2 * k + i];
      if (!pair) continue;
      d.text(pair[0], gx(from) + PAD, d.middle(row, 1, 7), { colour: MUTED });
      d.text(pair[1], gx(from + 5) + PAD, d.middle(row, 1, 7));
    }
  }
  d.vline(half, r + 2, r + 6);
  d.vline(split + 5, r + 2, r + 6);
  d.vline(half + 5, r + 2, r + 6);
  d.hline(r + 6, split);

  const width = (R - split) * C - 2 * PAD - 10;
  o.tradeOffs.slice(0, 2).forEach((t, i) => {
    const baseline = gy(r + 6) - PAD - 2 - (i + 1) * 11 + 3;
    d.text("-", gx(split) + PAD, baseline, { colour: MUTED });
    d.text(d.cut(t, d.regular, 7, width), gx(split) + PAD + 10, baseline);
  });
  d.row = r + H + 1;
}

/** The rules: one row each with value, status (unknown in blue) and source. */
function rules(d: Doc) {
  const m = d.model;
  const rows = 3 + m.rules.length;
  d.fit(rows, "Rules");
  const r = d.row;
  const cols = [L, L + 10, L + 18, L + 23];
  d.window(L, r, R - L, rows);
  d.header("Rules", r);
  ["Rule", "Value", "Status", "Source"].forEach((h, i) => d.text(h, gx(cols[i]!) + PAD, d.middle(r + 2, 1, 6.5), { size: 6.5, colour: MUTED }));
  m.rules.forEach((rule, i) => {
    const row = r + 3 + i;
    d.hline(row);
    const cells = [rule.rule, rule.value, rule.status, rule.source];
    cells.forEach((text, k) => {
      const w = ((cols[k + 1] ?? R) - cols[k]!) * C - 2 * PAD;
      d.text(d.cut(text, d.regular, 7, w), gx(cols[k]!) + PAD, d.middle(row, 1, 7), { colour: k === 2 && rule.status === "unknown" ? BLUE : INK });
    });
  });
  for (const c of cols.slice(1)) d.vline(c, r + 2, r + rows);
  d.row = r + rows + 1;
}

/** SPEC §11, short: the site and the view, every option, the rules and notes (with the narrative when it ran). */
export async function buildPdf(model: ReportModel, images: ReportImages, fonts: ReportFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${model.title}: ${model.address}`);
  pdf.setSubject(model.disclaimer);
  pdf.setProducer("Massing Studio");
  const d = new Doc(pdf, await pdf.embedFont(fonts.regular, { subset: true }), await pdf.embedFont(fonts.semibold, { subset: true }), model);

  await cover(d, images.cover);

  d.newPage("Options");
  for (const o of model.options) await option(d, o, images.options[o.image]!);

  if (model.narrative.length) {
    d.newPage("Summary");
    d.textWindow("Summary", model.narrative.flatMap((s) => [{ text: s.title, bold: true }, { text: s.text }]), "Summary");
  }
  d.newPage("Rules");
  rules(d);
  d.textWindow("Notes", model.notes.map((text) => ({ text, bullet: true })), "Rules");

  d.footer();
  return pdf.save();
}
