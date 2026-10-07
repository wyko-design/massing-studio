import {
  CONSTRAINT_FIELDS,
  PARAM_RANGES,
  PRIORITY_KEYS,
  PRIORITY_LABELS,
  PROGRAMME_RANGES,
  REF_FLOOR,
  REF_GROUND_FLOOR,
  TEMPLATES,
  TYPOLOGY_LABELS,
  fmtM,
  fmtM2,
  formatValue,
  getField,
  type EnvelopeFacts,
  type Priorities,
  type Programme,
  type SiteConstraints,
  type Typology,
} from "@massing/shared";

/** Typologies the generator can build. The model may only choose these. */
export const IMPLEMENTED_TYPOLOGIES = (Object.keys(TEMPLATES) as Typology[]).filter((t) => TEMPLATES[t]);

const TYPOLOGY_NOTES: Partial<Record<Typology, string>> = {
  slab: "a single bar of the chosen depth along the building axis",
  l_block: "a front wing plus a side wing at one end; reads as a slab when the envelope is too small for two wings",
  courtyard: "a ring of wings of the chosen depth around an open court; falls back to a slab when no court fits",
};

export const typologyList = () =>
  IMPLEMENTED_TYPOLOGIES.map((t) => `- ${t} (${TYPOLOGY_LABELS[t]}): ${TYPOLOGY_NOTES[t] ?? ""}`).join("\n");

/** One line per rule: label, Dutch term, value or "unknown", provenance status. */
export function constraintSummary(c: SiteConstraints): string {
  const lines = CONSTRAINT_FIELDS.map((f) => {
    const field = getField(c, f.path);
    const value = field ? formatValue(f, field.value) : "unknown";
    const status = field && field.value !== null ? ` [${field.prov.status.replace("_", " ")}]` : "";
    return `- ${f.label}${f.term ? ` (${f.term})` : ""}: ${value}${status}`;
  });
  for (const n of c.notes) if (n.value) lines.push(`- Note: ${n.value}`);
  return lines.join("\n");
}

export function factsSummary(f: EnvelopeFacts): string {
  const size = (s: EnvelopeFacts["street"]) => (s ? `${fmtM(s.length)} along the axis × ${fmtM(s.depth)} across` : "n/a");
  return [
    `- Parcel area: ${fmtM2(f.parcelArea)}`,
    `- Buildable envelope (${f.source}): ${fmtM2(f.area)}`,
    `- Envelope size, street-aligned frame: ${size(f.street)}`,
    `- Envelope size, sun-aligned (east-west) frame: ${size(f.sun)}`,
    `- Max height: ${f.maxHeight === null ? "unknown (floors are not limited by height)" : fmtM(f.maxHeight)}`,
    `- Floors that fit under max height (flat roof, ground floor ${fmtM(REF_GROUND_FLOOR)} + ${fmtM(REF_FLOOR)} floors): ${f.floorsAllowed ?? "unknown"}`,
    `- Max footprint by the coverage rule: ${f.maxFootprintByCoverage === null ? "unknown" : fmtM2(f.maxFootprintByCoverage)}`,
    `- GFA the programme needs: ${fmtM2(f.programmeGfa)}`,
    ...f.notes.map((n) => `- Envelope note: ${n}`),
  ].join("\n");
}

export const programmeSummary = (p: Programme) =>
  `- Target units: ${p.targetUnits}\n- Average unit size: ${p.avgUnitSize} m²\n- Net-to-gross: ${p.netToGross}`;

export const prioritiesSummary = (p: Priorities) => PRIORITY_KEYS.map((k) => `- ${k} (${PRIORITY_LABELS[k]}): ${p[k]} of 5`).join("\n");

export function rangesSummary(): string {
  const rows = Object.entries(PARAM_RANGES).map(([k, v]) => `- ${k}: ${v.min}–${v.max}${v.unit ? ` ${v.unit}` : ""}, step ${v.step}`);
  return rows.join("\n");
}

export function programmeRangesSummary(): string {
  return Object.entries(PROGRAMME_RANGES)
    .map(([k, v]) => `- ${k}: ${v.min}–${v.max}${v.unit ? ` ${v.unit}` : ""}`)
    .join("\n");
}

