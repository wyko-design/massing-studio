import type { Constrained, SiteConstraints } from "../schemas/constraints";
import { polygonWithHolesArea } from "../geo/planar";

export type FieldKind = "number" | "list" | "polygon" | "line";

export type FieldPath =
  | "allowedFunctions"
  | "bouwvlak"
  | "maxHeight"
  | "maxGutterHeight"
  | "buildingLine"
  | "setbacks.street"
  | "setbacks.side"
  | "setbacks.rear"
  | "streetSide"
  | "maxCoverage"
  | "maxFAR"
  | "parkingNorm";

export type ConstraintField = {
  path: FieldPath;
  label: string;
  /** Dutch planning term, as it appears in an omgevingsplan. */
  term?: string;
  unit?: string;
  kind: FieldKind;
};

/** Every single-valued constraint, in display order. `notes` are a list and handled separately. */
export const CONSTRAINT_FIELDS: readonly ConstraintField[] = [
  { path: "allowedFunctions", label: "Allowed functions", term: "bestemming", kind: "list" },
  { path: "bouwvlak", label: "Buildable area", term: "bouwvlak", kind: "polygon" },
  { path: "maxHeight", label: "Max building height", term: "bouwhoogte", unit: "m", kind: "number" },
  { path: "maxGutterHeight", label: "Max gutter height", term: "goothoogte", unit: "m", kind: "number" },
  { path: "buildingLine", label: "Building line", term: "bouwgrens / gevellijn", kind: "line" },
  { path: "setbacks.street", label: "Street setback", term: "afstand tot voorste perceelsgrens", unit: "m", kind: "number" },
  { path: "setbacks.side", label: "Side setback", term: "afstand tot zijdelingse perceelsgrens", unit: "m", kind: "number" },
  { path: "setbacks.rear", label: "Rear setback", term: "afstand tot achterste perceelsgrens", unit: "m", kind: "number" },
  { path: "streetSide", label: "Street side (bearing from parcel)", unit: "°", kind: "number" },
  { path: "maxCoverage", label: "Max coverage (0–1)", term: "bebouwingspercentage", kind: "number" },
  { path: "maxFAR", label: "Max FAR", term: "floor area ratio (FSI)", kind: "number" },
  { path: "parkingNorm", label: "Parking norm", term: "parkeernorm", unit: "spaces/unit", kind: "number" },
];

export const fieldByPath = (path: FieldPath): ConstraintField =>
  CONSTRAINT_FIELDS.find((f) => f.path === path)!;

/** The constrained value at a path; undefined when an optional field is absent. */
export function getField(c: SiteConstraints, path: FieldPath): Constrained<unknown> | undefined {
  if (path.startsWith("setbacks.")) return c.setbacks[path.slice(9) as keyof SiteConstraints["setbacks"]];
  return c[path as Exclude<FieldPath, `setbacks.${string}`>];
}

/** A copy of `c` with the field at `path` replaced. The caller guarantees the value type matches the field. */
export function setField(c: SiteConstraints, path: FieldPath, field: Constrained<unknown>): SiteConstraints {
  if (path.startsWith("setbacks.")) {
    return { ...c, setbacks: { ...c.setbacks, [path.slice(9)]: field } } as SiteConstraints;
  }
  return { ...c, [path]: field } as SiteConstraints;
}

/** Human-readable value for tables and override provenance. Null reads as "unknown". */
export function formatValue(field: ConstraintField, value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  switch (field.kind) {
    case "number":
      if (!field.unit) return String(value);
      return field.unit === "°" ? `${value as number}°` : `${value as number} ${field.unit}`;
    case "list":
      return (value as string[]).join(", ");
    case "polygon": {
      const rings = (value as { coordinates: [number, number][][] }).coordinates;
      const n = Math.max(0, (rings[0]?.length ?? 1) - 1);
      return `polygon, ${n} vertices, ${Math.round(polygonWithHolesArea(rings))} m²`;
    }
    case "line":
      return `line, ${(value as { coordinates: unknown[] }).coordinates.length} vertices`;
  }
}
