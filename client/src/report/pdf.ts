import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { ReportModel } from "./model";

/** Rendered images for the report as JPEG bytes. */
export type ReportImages = { cover: Uint8Array; options: Uint8Array[] };

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);
const STATUS_COLOURS: Record<string, ReturnType<typeof rgb>> = {
  pass: rgb(0.09, 0.36, 0.15),
  fail: rgb(0.54, 0.08, 0.14),
  unknown: MUTED,
};

const REPLACEMENTS: Record<string, string> = { "≤": "<=", "≥": ">=", "→": "->", "−": "-", "×": "x", "≈": "~", "‑": "-", " ": " " };

/** Writes a PDF with the standard fonts: text is mapped to what they can encode. */
class Writer {
  readonly pdf: PDFDocument;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(
    pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly mono: PDFFont,
  ) {
    this.pdf = pdf;
  }

  newPage() {
    this.page = this.pdf.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - MARGIN;
  }

  get width() {
    return A4[0] - 2 * MARGIN;
  }

  safe(text: string, font: PDFFont): string {
    const set = new Set(font.getCharacterSet());
    let out = "";
    for (const ch of text) {
      const r = REPLACEMENTS[ch] ?? ch;
      for (const c of r) out += set.has(c.codePointAt(0)!) ? c : "?";
    }
    return out;
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
          // a single word wider than the column is cut
          let rest = word;
          while (font.widthOfTextAtSize(rest, size) > width) {
            let n = rest.length - 1;
            while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
            lines.push(rest.slice(0, n));
            rest = rest.slice(n);
          }
          line = rest;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  text(text: string, o: { size?: number; font?: PDFFont; colour?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.font ?? this.regular;
    const lh = size * 1.35;
    for (const line of this.wrap(text, font, size, o.width ?? this.width)) {
      this.ensure(lh);
      this.y -= lh;
      this.page.drawText(line, { x: o.x ?? MARGIN, y: this.y + size * 0.25, size, font, color: o.colour ?? INK });
    }
    this.y -= o.gap ?? 0;
  }

  heading(text: string, level: 1 | 2 = 1) {
    const size = level === 1 ? 17 : 12;
    this.ensure(size * 3);
    this.y -= level === 1 ? 6 : 4;
    this.text(text, { size, font: this.bold, gap: level === 1 ? 4 : 2 });
    if (level === 1) {
      this.page.drawLine({ start: { x: MARGIN, y: this.y + 2 }, end: { x: MARGIN + this.width, y: this.y + 2 }, thickness: 0.6, color: RULE });
      this.y -= 6;
    }
  }

  /** Label / value pairs in two columns. */
  facts(rows: [string, string][], labelWidth = 120) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v, this.regular, 10, this.width - labelWidth);
      this.ensure(lines.length * 13.5);
      this.text(k, { size: 10, colour: MUTED, width: labelWidth - 8 });
      this.y += 13.5; // value on the same baseline as the label
      this.text(v, { size: 10, x: MARGIN + labelWidth, width: this.width - labelWidth });
    }
  }

  bullets(items: string[], size = 9.5) {
    for (const item of items) {
      this.ensure(size * 1.35);
      this.page.drawText("-", { x: MARGIN + 2, y: this.y - size * 1.1, size, font: this.regular, color: MUTED });
      this.text(item, { size, x: MARGIN + 14, width: this.width - 14, gap: 2 });
    }
  }

  table(headers: string[], rows: string[][], widths: number[], o: { size?: number; statusColumn?: number } = {}) {
    const size = o.size ?? 8.5;
    const lh = size * 1.3;
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = this.width / total;
    const w = widths.map((x) => x * scale);
    const drawRow = (cells: string[], bold: boolean, shade: boolean) => {
      const font = bold ? this.bold : this.regular;
      const wrapped = cells.map((c, i) => this.wrap(c, font, size, w[i]! - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 6;
      if (this.y - h < MARGIN + 24) {
        this.newPage();
        if (!bold) drawRow(headers, true, true);
      }
      if (shade) this.page.drawRectangle({ x: MARGIN, y: this.y - h, width: this.width, height: h, color: rgb(0.94, 0.94, 0.93) });
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        const colour = !bold && i === o.statusColumn ? (STATUS_COLOURS[cells[i]!] ?? INK) : INK;
        lines.forEach((line, k) => this.page.drawText(line, { x: x + 4, y: this.y - 4 - (k + 1) * lh + size * 0.35, size, font, color: colour }));
        x += w[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.4, color: RULE });
    };
    drawRow(headers, true, true);
    for (const r of rows) drawRow(r, false, false);
    this.y -= 6;
  }

  image(img: PDFImage, maxWidth: number, maxHeight: number, x = MARGIN) {
    const k = Math.min(maxWidth / img.width, maxHeight / img.height);
    const [w, h] = [img.width * k, img.height * k];
    this.ensure(h);
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    this.y -= h + 8;
  }
}

/** Placeholder watermark and footer on every page. */
function decorate(w: Writer, model: ReportModel) {
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    if (model.placeholder) {
      const text = "PLACEHOLDER DATA";
      const size = 74;
      const width = w.bold.widthOfTextAtSize(text, size);
      const angle = 45;
      const rad = (angle * Math.PI) / 180;
      page.drawText(text, {
        x: A4[0] / 2 - (width / 2) * Math.cos(rad) + (size * 0.35) * Math.sin(rad),
        y: A4[1] / 2 - (width / 2) * Math.sin(rad) - (size * 0.35) * Math.cos(rad),
        size,
        font: w.bold,
        color: rgb(0.07, 0.07, 0.07),
        opacity: 0.07,
        rotate: degrees(angle),
      });
    }
    const left = w.safe(`${model.address} · ${model.disclaimer}`, w.regular);
    page.drawText(left, { x: MARGIN, y: 28, size: 7.5, font: w.regular, color: MUTED });
    const right = `${i + 1} / ${total}`;
    page.drawText(right, { x: A4[0] - MARGIN - w.regular.widthOfTextAtSize(right, 7.5), y: 28, size: 7.5, font: w.regular, color: MUTED });
    if (model.placeholder) {
      const tag = "PLACEHOLDER DATA: planning values are assumed";
      page.drawText(tag, { x: MARGIN, y: 17, size: 7.5, font: w.bold, color: rgb(0.54, 0.08, 0.14) });
    }
  });
}

function narrative(w: Writer, model: ReportModel, id: keyof ReportModel["narrative"]) {
  const n = model.narrative[id];
  if (n) w.text(n.text, { size: 10, gap: 6 });
}

/** SPEC §11: cover, site, constraints, options, comparison, assumptions and limitations. */
export async function buildPdf(model: ReportModel, images: ReportImages): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${model.title}: ${model.address}`);
  pdf.setSubject(model.disclaimer);
  pdf.setProducer("Massing Studio");
  const w = new Writer(pdf, await pdf.embedFont(StandardFonts.Helvetica), await pdf.embedFont(StandardFonts.HelveticaBold), await pdf.embedFont(StandardFonts.Courier));

  // 1. Cover
  w.newPage();
  w.y -= 4;
  w.text(model.title.toUpperCase(), { size: 10, font: w.mono, colour: MUTED, gap: 2 });
  w.text(model.address, { size: 22, font: w.bold, gap: 4 });
  w.text(model.date, { size: 10, colour: MUTED, gap: 10 });
  w.image(await pdf.embedJpg(images.cover), w.width, 540);
  w.text(model.disclaimer, { size: 10, font: w.bold, gap: 4 });
  if (model.placeholder) w.text("Planning values in this study are placeholders (assumed), not real plan rules.", { size: 9.5, colour: STATUS_COLOURS.fail! });

  // 2. Site
  w.newPage();
  w.heading("Site");
  narrative(w, model, "site");
  w.facts(model.site.facts);
  w.y -= 4;
  w.heading("Data sources", 2);
  w.bullets(model.site.sources.length ? model.site.sources : ["unknown"]);

  // 3. Constraints
  w.newPage();
  w.heading("Constraints");
  narrative(w, model, "constraints");
  w.table(
    ["Rule", "Value", "Status", "Source and quote"],
    model.constraints.rows.map((r) => [r.term ? `${r.rule} (${r.term})` : r.rule, r.value, r.status, [r.source, r.quote ? `"${r.quote}"` : ""].filter(Boolean).join(" - ")]),
    [150, 90, 55, 200],
  );
  w.heading("Buildable envelope", 2);
  w.bullets(model.constraints.envelope);
  w.heading("Open questions", 2);
  w.bullets(
    model.constraints.unknowns.length
      ? [`Unknown, to be checked: ${model.constraints.unknowns.join(", ")}.`, ...model.constraints.notes]
      : ["No rule is unknown.", ...model.constraints.notes],
  );

  // 4. Options
  for (const o of model.options) {
    w.newPage();
    w.heading(o.name === `Option ${o.id}` ? o.name : `Option ${o.id}: ${o.name}`);
    w.image(await pdf.embedJpg(images.options[o.image]!), w.width * 0.75, 340);
    if (o.intent) w.text(o.intent, { size: 10.5, gap: 4 });
    w.facts([...o.facts, ...o.metrics], 130);
    if (o.tradeOffs.length) {
      w.heading("Trade-offs", 2);
      w.bullets(o.tradeOffs);
    }
    w.heading("Compliance (indicative)", 2);
    w.table(
      ["Rule", "Status", "Detail"],
      o.compliance.map((c) => [c.rule, c.status, c.detail]),
      [130, 50, 270],
      { statusColumn: 1 },
    );
    w.heading("Clamps", 2);
    w.bullets(o.clamps.length ? o.clamps : ["None: the option is built as asked."]);
  }
  // 5. Comparison
  w.newPage();
  w.heading("Comparison");
  narrative(w, model, "options");
  narrative(w, model, "comparison");
  w.table(model.comparison.headers, model.comparison.rows, [120, ...model.options.map(() => 330 / Math.max(1, model.options.length))], { size: 9 });

  // 7. Assumptions and limitations
  w.heading("Assumptions", 1);
  w.bullets(model.assumptions);
  w.heading("Limitations", 1);
  narrative(w, model, "limitations");
  w.bullets(model.limitations);

  decorate(w, model);
  return pdf.save();
}
