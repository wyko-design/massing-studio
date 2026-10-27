import {
  CONSTRAINT_FIELDS,
  TYPOLOGY_LABELS,
  fmtM,
  fmtM2,
  fmtRatio,
  formatValue,
  getField,
  type Compliance,
  type Envelope,
  type MassingParams,
  type MassingResult,
  type Programme,
  type SiteConstraints,
  type SiteScene,
  type WriteReportResult,
} from "@massing/shared";

/**
 * Everything the PDF says, as plain data (SPEC §11). Numbers are formatted from computed values
 * here; the narrative is the report writer's output, whose numbers code already filled in.
 */
export type ReportOption = {
  id: string;
  name: string;
  /** Strategy generator's words; absent when directions were never generated. */
  intent?: string;
  tradeOffs: string[];
  facts: [string, string][];
  metrics: [string, string][];
  compliance: Compliance[];
  clamps: string[];
  /** Index into `ReportInput.images.options`. */
  image: number;
};

export type ConstraintRow = { rule: string; term: string; value: string; status: string; source: string; quote: string };

export type ReportModel = {
  title: string;
  address: string;
  date: string;
  placeholder: boolean;
  disclaimer: string;
  site: { facts: [string, string][]; sources: string[] };
  constraints: { rows: ConstraintRow[]; unknowns: string[]; notes: string[]; envelope: string[] };
  options: ReportOption[];
  comparison: { headers: string[]; rows: string[][] };
  assumptions: string[];
  limitations: string[];
  /** Narrative paragraph per section id, when the report writer ran. */
  narrative: Partial<Record<"site" | "constraints" | "options" | "comparison" | "limitations", { title: string; text: string }>>;
};

export type ReportInput = {
  scene: SiteScene;
  constraints: SiteConstraints;
  envelope: Envelope;
  programme: Programme;
  options: { id: string; params: MassingParams; result: MassingResult; name?: string; intent?: string; tradeOffs?: string[] }[];
  placeholder: boolean;
  /** ISO date (yyyy-mm-dd) shown on the cover. */
  date: string;
  narrative?: WriteReportResult | null;
};

export const DISCLAIMER = "Indicative early study. Not a permit check and not a financial appraisal.";

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (bearing: number) => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16]!;

const STATUS = (value: unknown, status: string) => (value === null || value === undefined ? "unknown" : status.replace("_", " "));

export const LIMITATIONS = [
  "This is an indicative early study. It is not a permit check, a legal opinion or a financial appraisal.",
  "The parcel boundary comes from the Kadaster map and is not legally measured.",
  "Context buildings are extruded from 3DBAG footprints to a roof height; roofs and facades are simplified.",
  "Planning values marked assumed or unknown must be checked against the current plan before use.",
  "Massing options are generated from rules and parameters; unit counts and sun scores are coarse estimates.",
  "Parking, daylight, structure, floor plans and facades are not assessed.",
];

export function buildReportModel(input: ReportInput): ReportModel {
  const { scene, constraints, envelope, programme } = input;
  const address = scene.meta?.address ?? `Parcel ${scene.parcel.id}`;
  const streetSide = constraints.streetSide?.value ?? null;

  const rows: ConstraintRow[] = [];
  const unknowns: string[] = [];
  for (const f of CONSTRAINT_FIELDS) {
    const c = getField(constraints, f.path);
    const value = c?.value ?? null;
    rows.push({
      rule: f.label,
      term: f.term ?? "",
      value: formatValue(f, value),
      status: STATUS(value, c?.prov.status ?? "assumed"),
      source: c?.prov.source ?? "",
      quote: c?.prov.quote ?? "",
    });
    if (value === null) unknowns.push(f.label);
  }

  const options: ReportOption[] = input.options.map((o, i) => {
    const m = o.result.metrics;
    return {
      id: o.id,
      name: o.name ?? `Option ${o.id}`,
      ...(o.intent ? { intent: o.intent } : {}),
      tradeOffs: o.tradeOffs ?? [],
      facts: [
        ["Typology", TYPOLOGY_LABELS[o.params.typology]],
        ["Roof", o.params.roof],
        ["Alignment", o.params.alignment === "street" ? "to the street" : "east–west (sun)"],
      ],
      metrics: [
        ["Footprint", fmtM2(m.footprint)],
        ["GFA", fmtM2(m.gfa)],
        ["Coverage", fmtRatio(m.coverage)],
        ["FAR", fmtRatio(m.far)],
        ["Height", fmtM(m.height)],
        ["Floors", String(m.floors)],
        ["Est. units", `${m.estUnits} (target ${programme.targetUnits})`],
        ["Sun score (0–1)", fmtRatio(m.facadeSunScore)],
      ],
      compliance: o.result.compliance,
      clamps: o.result.clamps,
      image: i,
    };
  });

  const count = (o: (typeof input.options)[number], s: Compliance["status"]) => o.result.compliance.filter((c) => c.status === s).length;
  const metricRow = (label: string, f: (o: (typeof input.options)[number]) => string) => [label, ...input.options.map(f)];
  const comparison = {
    headers: ["", ...input.options.map((o) => o.name ?? `Option ${o.id}`)],
    rows: [
      metricRow("Typology", (o) => TYPOLOGY_LABELS[o.params.typology]),
      metricRow("Footprint", (o) => fmtM2(o.result.metrics.footprint)),
      metricRow("GFA", (o) => fmtM2(o.result.metrics.gfa)),
      metricRow("Coverage", (o) => fmtRatio(o.result.metrics.coverage)),
      metricRow("FAR", (o) => fmtRatio(o.result.metrics.far)),
      metricRow("Height", (o) => fmtM(o.result.metrics.height)),
      metricRow("Floors", (o) => String(o.result.metrics.floors)),
      metricRow("Est. units", (o) => String(o.result.metrics.estUnits)),
      metricRow("Sun score", (o) => fmtRatio(o.result.metrics.facadeSunScore)),
      metricRow("Rules pass / fail / unknown", (o) => `${count(o, "pass")} / ${count(o, "fail")} / ${count(o, "unknown")}`),
      metricRow("Clamps applied", (o) => String(o.result.clamps.length)),
    ],
  };

  const assumptions = [
    `Programme: ${programme.targetUnits} target units, ${programme.avgUnitSize} m² average unit, net-to-gross ${fmtRatio(programme.netToGross)} (editable assumptions).`,
    ...envelope.notes,
    ...new Set(input.options.flatMap((o) => o.result.assumptions)),
  ];

  const narrative: ReportModel["narrative"] = {};
  for (const s of input.narrative?.sections ?? []) narrative[s.id] = { title: s.title, text: s.text };

  return {
    title: "Massing study",
    address,
    date: input.date,
    placeholder: input.placeholder,
    disclaimer: DISCLAIMER,
    site: {
      facts: [
        ["Address", address],
        ["Parcel", scene.parcel.id],
        ["Area (Kadaster)", fmtM2(scene.parcel.areaM2)],
        ["Boundary", "indicative, not legally measured"],
        ["Street side", streetSide === null ? "unknown" : `${Math.round(streetSide)}° (${compass(streetSide)}) from the parcel`],
        ["Context buildings", scene.meta ? `${scene.meta.contextCount} (3DBAG)${scene.meta.skippedContext ? `, ${scene.meta.skippedContext} skipped for missing height` : ""}` : "unknown"],
      ],
      sources: scene.meta?.sources ?? [],
    },
    constraints: {
      rows,
      unknowns,
      notes: constraints.notes.map((n) => `${n.value ?? ""} (${n.prov.source})`.trim()),
      envelope: [
        `Buildable envelope from: ${envelope.source}${envelope.maxHeight === null ? ", maximum height unknown" : `, maximum height ${fmtM(envelope.maxHeight)}`} (${envelope.prov.status.replace("_", " ")}).`,
        ...envelope.notes,
      ],
    },
    options,
    comparison,
    assumptions,
    limitations: LIMITATIONS,
    narrative,
  };
}
