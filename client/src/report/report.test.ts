import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateMassing, type SiteScene } from "@massing/shared";
import { k2410, k2410Area, k2410Envelope, k2410Rules, params, site } from "../../../shared/src/massing/__fixtures__/sites";
import { buildReportModel, compass, type ReportInput } from "./model";
import { buildPdf, type ReportFonts } from "./pdf";

// 1×1 JPEG
const JPEG = Uint8Array.from(
  atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="),
  (c) => c.charCodeAt(0),
);
const font = (weight: number) => new Uint8Array(readFileSync(path.join(import.meta.dirname, "fonts", `ibm-plex-mono-${weight}.ttf`)));
const fonts: ReportFonts = { regular: font(400), semibold: font(600) };

const scene: SiteScene = {
  origin: { lat: 52, lon: 4.36 },
  parcel: { id: "DEL00 K 2410", areaM2: 111, ring: k2410, indicative: true },
  context: [],
  meta: { address: "Hendrik Casimirstraat 8, 2628KJ Delft", sources: ["PDOK Locatieserver", "Kadaster"], contextCount: 773, skippedContext: 2 },
};
const programme = { targetUnits: 12, avgUnitSize: 65, netToGross: 0.75 };
const options = (["A", "B", "C"] as const).map((id, i) => ({
  id,
  params: params({ floors: 3 + i }),
  result: generateMassing(k2410Envelope, k2410Rules, params({ floors: 3 + i }), site(k2410Area)),
  ...(id === "A" ? { name: "Quiet slab", tradeOffs: ["Less daylight at the rear"] } : {}),
}));
const input: ReportInput = { scene, constraints: k2410Rules, envelope: k2410Envelope, programme, options, date: "2026-10-06" };

describe("buildReportModel", () => {
  const m = buildReportModel(input);
  it("states site facts from computed values", () => {
    expect(m.site).toContainEqual(["Plot area", "111 m² (Kadaster)"]);
    expect(m.site).toContainEqual(["Street side", "65° (ENE)"]);
  });
  it("lists every rule with status; null reads unknown", () => {
    expect(m.rules).toHaveLength(12);
    const gutter = m.rules.find((r) => r.rule === "Max gutter height")!;
    expect(gutter).toMatchObject({ value: "unknown", status: "unknown", source: "" });
    expect(m.notes.some((n) => n.startsWith("Unknown, to be checked:") && n.includes("Max gutter height"))).toBe(true);
  });
  it("builds one block per option with the option panel's numbers", () => {
    expect(m.options.map((o) => o.name)).toEqual(["Quiet slab", "Option B", "Option C"]);
    const a = m.options[0]!;
    expect(a.metrics.map(([k]) => k)).toEqual(["Footprint", "GFA", "Coverage", "FAR", "Height", "Floors", "Homes", "Sun score"]);
    expect(a.metrics).toContainEqual(["GFA", `${Math.round(options[0]!.result.metrics.gfa)} m²`]);
    expect(a.failed).toBe(options[0]!.result.compliance.filter((c) => c.status === "fail").length);
  });
  it("carries the disclaimer and the short limitations", () => {
    expect(m.disclaimer).toContain("Not a permit check");
    expect(m.notes.some((n) => n.includes("not legally measured"))).toBe(true);
  });
  it("compass names", () => {
    expect([compass(0), compass(90), compass(180), compass(359)]).toEqual(["N", "E", "S", "N"]);
  });
});

describe("buildPdf", () => {
  it("fits the site, the options and the rules on three pages", async () => {
    const bytes = await buildPdf(buildReportModel(input), { cover: JPEG, options: [JPEG, JPEG, JPEG] }, fonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getTitle()).toContain("Hendrik Casimirstraat");
  });
  it("takes five options and a long narrative, and characters the font lacks", async () => {
    const model = buildReportModel({
      ...input,
      options: [...options, ...options.slice(0, 2)],
      narrative: { sections: Array.from({ length: 5 }, () => ({ id: "site" as const, title: "Site", text: "A terraced plot of 111 m² → near the canal ≤ 15 m. ".repeat(12) })) },
    });
    model.notes.push("Roof ≥ 40° → pitched ‑ “quoted” 日本");
    const pdf = await PDFDocument.load(await buildPdf(model, { cover: JPEG, options: Array(5).fill(JPEG) }, fonts));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
