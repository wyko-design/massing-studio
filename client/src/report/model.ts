import {
  CONSTRAINT_FIELDS,
  fmtM,
  fmtM2,
  fmtRatio,
  formatValue,
  getField,
  type Envelope,
  type MassingParams,
  type MassingResult,
  type Programme,
  type SiteConstraints,
  type SiteScene,
  type WriteReportResult,
} from "@massing/shared";

/**
 * Everything the PDF says, as plain data (SPEC §11), kept short: the site, one block per option with the numbers of the
 * studio's option panel, the rules and a few notes. Numbers are formatted from computed values here; the narrative is
 * the report writer's output, whose numbers code already filled in.
 */
export type ReportOption = {
  id: string;
  name: string;
  tradeOffs: string[];
  /** Label / value pairs, in the option panel's order. */
  metrics: [string, string][];
  /** Rules the option breaks (blue chip) and rules that cannot be checked. */
  failed: number;
  unknown: number;
  /** Index into `ReportImages.options`. */
  image: number;
};

export type RuleRow = { rule: string; value: string; status: string; source: string };

export type ReportModel = {
  title: string;
  address: string;
  date: string;
  disclaimer: string;
  site: [string, string][];
  options: ReportOption[];
  rules: RuleRow[];
  notes: string[];
  /** The report writer's sections, when it ran ("Full report"). */
  narrative: { title: string; text: string }[];
};

export type ReportInput = {
  scene: SiteScene;
  constraints: SiteConstraints;
  envelope: Envelope;
  programme: Programme;
  options: { id: string; params: MassingParams; result: MassingResult; name?: string; tradeOffs?: string[] }[];
  /** ISO date (yyyy-mm-dd) shown on the first page. */
  date: string;
  narrative?: WriteReportResult | null;
};

export const DISCLAIMER = "Indicative early study. Not a permit check and not a financial appraisal.";

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (bearing: number) => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16]!;

export const LIMITATIONS = [
  "Parcel boundary from the Kadaster map, not legally measured; context buildings from 3DBAG, simplified.",
  "Homes and sun scores are coarse estimates. Parking, daylight, structure and facades are not assessed.",
];

export function buildReportModel(input: ReportInput): ReportModel {
  const { scene, constraints, envelope, programme } = input;
  const address = scene.meta?.address ?? `Parcel ${scene.parcel.id}`;
  const streetSide = constraints.streetSide?.value ?? null;

  const rules: RuleRow[] = [];
  const unknowns: string[] = [];
  let known = 0;
  for (const f of CONSTRAINT_FIELDS) {
    const c = getField(constraints, f.path);
    const value = c?.value ?? null;
    if (value === null) unknowns.push(f.label);
    else known++;
    rules.push({
      rule: f.label,
      value: formatValue(f, value),
      status: value === null ? "unknown" : (c?.prov.status ?? "assumed").replace("_", " "),
      source: value === null ? "" : (c?.prov.source ?? ""),
    });
  }
  const assumed = rules.filter((r) => r.status === "assumed").length;

  const options: ReportOption[] = input.options.map((o, i) => {
    const m = o.result.metrics;
    return {
      id: o.id,
      name: o.name ?? `Option ${o.id}`,
      tradeOffs: o.tradeOffs ?? [],
      metrics: [
        ["Footprint", fmtM2(m.footprint)],
        ["GFA", fmtM2(m.gfa)],
        ["Coverage", fmtRatio(m.coverage)],
        ["FAR", fmtRatio(m.far)],
        ["Height", fmtM(m.height)],
        ["Floors", String(m.floors)],
        ["Homes", String(m.estUnits)],
        ["Sun score", fmtRatio(m.facadeSunScore)],
      ],
      failed: o.result.compliance.filter((c) => c.status === "fail").length,
      unknown: o.result.compliance.filter((c) => c.status === "unknown").length,
      image: i,
    };
  });

  const clamped = input.options.filter((o) => o.result.clamps.length).map((o) => `${o.name ?? `Option ${o.id}`} (${o.result.clamps.length})`);
  const notes = [
    `Programme: ${programme.avgUnitSize} m² average home, net-to-gross ${fmtRatio(programme.netToGross)}.`,
    `Envelope from ${envelope.source}${envelope.maxHeight === null ? ", maximum height unknown" : `, maximum height ${fmtM(envelope.maxHeight)}`} (${envelope.prov.status.replace("_", " ")}).`,
    ...(clamped.length ? [`Fitted to the rules by the generator: ${clamped.join(", ")}.`] : []),
    ...(unknowns.length ? [`Unknown, to be checked: ${unknowns.join(", ")}.`] : []),
    ...LIMITATIONS,
  ];

  return {
    title: "Massing study",
    address,
    date: input.date,
    disclaimer: DISCLAIMER,
    site: [
      ["Parcel", scene.parcel.id],
      ["Plot area", `${fmtM2(scene.parcel.areaM2)} (Kadaster)`],
      ["Street side", streetSide === null ? "unknown" : `${Math.round(streetSide)}° (${compass(streetSide)})`],
      ["Rules", `${known} known (${assumed} assumed) · ${unknowns.length} unknown`],
      ["Options", String(options.length)],
    ],
    options,
    rules,
    notes,
    narrative: (input.narrative?.sections ?? []).map((s) => ({ title: s.title, text: s.text })),
  };
}
