import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateMassing, type SiteScene } from "@massing/shared";
import { k2410, k2410Area, k2410Envelope, k2410Rules, params, site } from "../../../shared/src/massing/__fixtures__/sites";
import { buildReportModel, compass, type ReportInput } from "./model";
import { buildPdf } from "./pdf";

// 1×1 JPEG
const JPEG = Uint8Array.from(
  atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="),
  (c) => c.charCodeAt(0),
);

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
  ...(id === "A" ? { name: "Quiet slab", intent: "A calm bar to the street.", tradeOffs: ["Less daylight at the rear"] } : {}),
}));
const input: ReportInput = { scene, constraints: k2410Rules, envelope: k2410Envelope, programme, options, placeholder: true, date: "2026-10-06" };

describe("buildReportModel", () => {
  const m = buildReportModel(input);
  it("states site facts from computed values", () => {
    expect(m.site.facts).toContainEqual(["Area (Kadaster)", "111 m²"]);
    expect(m.site.facts).toContainEqual(["Street side", "65° (ENE) from the parcel"]);
    expect(m.site.facts.find(([k]) => k === "Context buildings")![1]).toContain("773");
  });
  it("lists every constraint with status; null reads unknown", () => {
    expect(m.constraints.rows).toHaveLength(12);
    const gutter = m.constraints.rows.find((r) => r.rule === "Max gutter height")!;
    expect(gutter.value).toBe("unknown");
    expect(gutter.status).toBe("unknown");
    expect(m.constraints.unknowns).toContain("Max gutter height");
  });
  it("builds one block per option with metrics and compliance", () => {
    expect(m.options.map((o) => o.name)).toEqual(["Quiet slab", "Option B", "Option C"]);
    const a = m.options[0]!;
    expect(a.metrics).toContainEqual(["GFA", `${Math.round(options[0]!.result.metrics.gfa)} m²`]);
    expect(a.compliance.length).toBeGreaterThan(0);
  });
  it("compares options in one table", () => {
    expect(m.comparison.headers).toHaveLength(4);
    expect(m.comparison.rows.every((r) => r.length === 4)).toBe(true);
    expect(m.comparison.rows.map((r) => r[0])).toContain("Rules pass / fail / unknown");
  });
  it("always carries assumptions and limitations", () => {
    expect(m.assumptions[0]).toContain("12 target units");
    expect(m.limitations.length).toBeGreaterThan(3);
    expect(m.disclaimer).toContain("Not a permit check");
  });
  it("compass names", () => {
    expect([compass(0), compass(90), compass(180), compass(359)]).toEqual(["N", "E", "S", "N"]);
  });
});

describe("buildPdf", () => {
  it("writes the sections of SPEC §11 as pages, with a placeholder watermark", async () => {
    const model = buildReportModel({
      ...input,
      narrative: { sections: [{ id: "site", title: "Site", text: "A terraced plot of 111 m² → near the canal ≤ 15 m." }] },
    });
    const bytes = await buildPdf(model, { cover: JPEG, options: [JPEG, JPEG, JPEG] });
    const pdf = await PDFDocument.load(bytes);
    // cover, site, constraints, 3 options, comparison + assumptions: at least 7 pages
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(7);
    expect(pdf.getTitle()).toContain("Hendrik Casimirstraat");
  });
  it("does not throw on characters the standard fonts cannot encode", async () => {
    const model = buildReportModel({ ...input, placeholder: false });
    model.assumptions.push("Roof ≥ 40° → pitched ‑ “quoted” 日本");
    await expect(buildPdf(model, { cover: JPEG, options: [JPEG, JPEG, JPEG] })).resolves.toBeInstanceOf(Uint8Array);
  });
});
