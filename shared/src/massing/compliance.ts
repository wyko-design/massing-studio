import type { Constrained, Envelope, SiteConstraints } from "../schemas/constraints";
import type { Compliance, MassingMetrics } from "../schemas/massing";
import { fieldByPath, type FieldPath } from "../constraints/fields";
import { fmtM, fmtRatio, statusLabel } from "./format";

/** Function names that count as residential in a bestemming. */
const RESIDENTIAL = /wonen|woon|resident/i;

export type ComplianceInput = {
  metrics: MassingMetrics;
  /** Top of the walls (gutter), m. */
  wallTop: number;
  /** Farthest the footprint reaches outside the envelope, m (≈ 0 by construction). */
  outsideEnvelope: number;
};

const EPS = 1e-6;

/**
 * One row per rule (SPEC §8). A null or absent rule is `unknown`, never `pass`. Details quote the
 * computed number, the limit and the rule's provenance status. Indicative, not a permit check.
 */
export function checkCompliance(rules: SiteConstraints, envelope: Envelope, input: ComplianceInput | null): Compliance[] {
  const rows: Compliance[] = [];
  const row = (path: FieldPath, status: Compliance["status"], detail: string) =>
    rows.push({ rule: fieldByPath(path).label, status, detail });

  /** Compare a computed value against a max rule. */
  const max = (path: FieldPath, c: Constrained<number> | undefined, value: number | undefined, fmt: (x: number) => string) => {
    const limit = c?.value ?? null;
    if (value === undefined) return row(path, "unknown", "Nothing generated.");
    if (!c || limit === null) return row(path, "unknown", `Rule unknown; the massing has ${fmt(value)}.`);
    const ok = value <= limit + EPS;
    row(path, ok ? "pass" : "fail", `${fmt(value)} ${ok ? "≤" : ">"} ${fmt(limit)} (${statusLabel(c.prov)})`);
  };

  const fn = rules.allowedFunctions;
  if (fn.value === null) row("allowedFunctions", "unknown", "Rule unknown; the massing is residential.");
  else if (fn.value.some((f) => RESIDENTIAL.test(f))) row("allowedFunctions", "pass", `Residential fits "${fn.value.join(", ")}" (${statusLabel(fn.prov)})`);
  else row("allowedFunctions", "fail", `Residential is not among "${fn.value.join(", ")}" (${statusLabel(fn.prov)})`);

  const m = input?.metrics;
  max("maxHeight", rules.maxHeight, m?.height, fmtM);
  max("maxGutterHeight", rules.maxGutterHeight, input?.wallTop, fmtM);
  max("maxCoverage", rules.maxCoverage, m?.coverage, fmtRatio);
  max("maxFAR", rules.maxFAR, m?.far, fmtRatio);

  const norm = rules.parkingNorm?.value ?? null;
  if (!m) row("parkingNorm", "unknown", "Nothing generated.");
  else if (norm === null) row("parkingNorm", "unknown", "Rule unknown; parking is not modelled.");
  else {
    const spaces = Math.ceil(m.estUnits * norm - EPS);
    row("parkingNorm", "unknown", `Needs ${spaces} spaces (${m.estUnits} units × ${norm}/unit, ${statusLabel(rules.parkingNorm!.prov)}); parking is not modelled.`);
  }

  const env = `the ${envelope.source} envelope (${statusLabel(envelope.prov)})`;
  if (!input) rows.push({ rule: "Inside buildable envelope", status: "unknown", detail: "Nothing generated." });
  else if (input.outsideEnvelope < 0.001) rows.push({ rule: "Inside buildable envelope", status: "pass", detail: `Inside ${env}` });
  else rows.push({ rule: "Inside buildable envelope", status: "fail", detail: `Reaches ${fmtM(input.outsideEnvelope)} outside ${env}` });
  return rows;
}
