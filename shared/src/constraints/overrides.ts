import type { Constrained, Envelope, Provenance, SiteConstraints } from "../schemas/constraints";
import { CONSTRAINT_FIELDS, formatValue, getField, setField, type FieldPath } from "./fields";

/** User-entered values per field. `null` means the user says "unknown". */
export type Overrides = Partial<Record<FieldPath, unknown>>;

/** Constraints with every overridden field replaced and its provenance set to `user_override`. */
export function applyOverrides(c: SiteConstraints, overrides: Overrides): SiteConstraints {
  let out = c;
  for (const field of CONSTRAINT_FIELDS) {
    if (!(field.path in overrides)) continue;
    const prev = getField(c, field.path);
    const was = prev ? `${formatValue(field, prev.value)}, ${prev.prov.status}` : "absent";
    out = setField(out, field.path, {
      value: overrides[field.path] ?? null,
      ...(field.unit ? { unit: field.unit } : {}),
      prov: { source: `User override (was ${was})`, status: "user_override" },
    });
  }
  return out;
}

/** Every field present and null: what the app knows about a parcel without a site fixture. */
export function unknownConstraints(reason: string): SiteConstraints {
  const prov: Provenance = { source: reason, status: "assumed" };
  let c: SiteConstraints = {
    allowedFunctions: { value: null, prov },
    maxHeight: { value: null, unit: "m", prov },
    setbacks: {
      street: { value: null, unit: "m", prov },
      side: { value: null, unit: "m", prov },
      rear: { value: null, unit: "m", prov },
    },
    notes: [],
  };
  for (const field of CONSTRAINT_FIELDS) {
    if (!getField(c, field.path)) c = setField(c, field.path, { value: null, ...(field.unit ? { unit: field.unit } : {}), prov });
  }
  return c;
}

/** Paths (and note indices) whose provenance is still `assumed`. */
export function assumedFields(c: SiteConstraints): string[] {
  const fields = CONSTRAINT_FIELDS.filter((f) => getField(c, f.path)?.prov.status === "assumed").map((f) => f.path as string);
  const notes = c.notes.flatMap((n, i) => (n.prov.status === "assumed" ? [`notes.${i}`] : []));
  return [...fields, ...notes];
}

/** Placeholder data: any constraint or the envelope rests on an assumption. Drives the export watermark. */
export const isPlaceholder = (c: SiteConstraints, envelope?: Envelope): boolean =>
  assumedFields(c).length > 0 || envelope?.prov.status === "assumed";

/** Rule values proposed by the constraint interpreter (status `extracted`, with quotes), per field. */
export type Extracted = { fields: Partial<Record<FieldPath, Constrained<unknown>>>; notes: Constrained<string>[] };

export const NO_EXTRACTED: Extracted = { fields: {}, notes: [] };

/** Constraints with the accepted extracted values in place. User overrides are applied on top of this. */
export function applyExtracted(c: SiteConstraints, extracted: Extracted): SiteConstraints {
  let out = c;
  for (const [path, field] of Object.entries(extracted.fields) as [FieldPath, Constrained<unknown>][]) out = setField(out, path, field);
  return extracted.notes.length ? { ...out, notes: [...out.notes, ...extracted.notes] } : out;
}
