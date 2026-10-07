import { describe, expect, it } from "vitest";
import type { SiteConstraints } from "../schemas/constraints";
import { CONSTRAINT_FIELDS, formatValue, getField, fieldByPath } from "./fields";
import { applyExtracted, applyOverrides, assumedFields, isPlaceholder, unknownConstraints } from "./overrides";
import { constraintsToLocal } from "./shift";
import { resolveEnvelope } from "../envelope/resolveEnvelope";

const verified = { source: "plan", status: "verified" as const };

function allVerified(): SiteConstraints {
  let c = unknownConstraints("x");
  c = {
    ...c,
    allowedFunctions: { value: ["Wonen"], prov: verified },
    maxHeight: { value: 12, unit: "m", prov: verified },
    maxGutterHeight: { value: null, unit: "m", prov: verified },
    setbacks: {
      street: { value: 3, unit: "m", prov: verified },
      side: { value: 3, unit: "m", prov: verified },
      rear: { value: 3, unit: "m", prov: verified },
    },
  };
  for (const f of CONSTRAINT_FIELDS) {
    const field = getField(c, f.path)!;
    if (field.prov.status === "assumed") Object.assign(field, { prov: verified });
  }
  return c;
}

describe("constraints", () => {
  it("unknownConstraints has every field, all null", () => {
    const c = unknownConstraints("No site fixture");
    for (const f of CONSTRAINT_FIELDS) expect(getField(c, f.path)?.value).toBeNull();
    expect(isPlaceholder(c)).toBe(true);
  });

  it("overrides replace the value and set user_override", () => {
    const c = applyOverrides(unknownConstraints("fixture"), { maxHeight: 9, "setbacks.rear": 4, allowedFunctions: null });
    expect(c.maxHeight).toMatchObject({ value: 9, unit: "m", prov: { status: "user_override" } });
    expect(c.maxHeight.prov.source).toMatch(/was unknown, assumed/);
    expect(c.setbacks.rear.value).toBe(4);
    expect(c.allowedFunctions.prov.status).toBe("user_override");
    expect(c.setbacks.street.prov.status).toBe("assumed");
  });

  it("placeholder is false only when nothing is assumed", () => {
    const c = allVerified();
    expect(assumedFields(c)).toEqual([]);
    expect(isPlaceholder(c, resolveEnvelope([[0, 0], [20, 0], [20, 20], [0, 20]], c))).toBe(false);
    // equal verified setbacks, but a parcel-path envelope would still be assumed
    const noSetbacks = applyOverrides(c, { "setbacks.side": null });
    expect(isPlaceholder(noSetbacks)).toBe(false);
    expect(isPlaceholder(noSetbacks, resolveEnvelope([[0, 0], [20, 0], [20, 20], [0, 20]], noSetbacks))).toBe(true);
    expect(isPlaceholder({ ...c, notes: [{ value: "x", prov: { source: "s", status: "assumed" } }] })).toBe(true);
  });

  it("shifts bouwvlak and building line to the local frame", () => {
    const c = constraintsToLocal(
      {
        ...unknownConstraints("x"),
        bouwvlak: { value: { type: "Polygon", coordinates: [[[100, 200], [110, 200], [110, 210], [100, 200]]] }, prov: verified },
        buildingLine: { value: { type: "LineString", coordinates: [[100, 200], [110, 200]] }, prov: verified },
      },
      [100, 200],
    );
    expect(c.bouwvlak?.value?.coordinates[0]?.[1]).toEqual([10, 0]);
    expect(c.buildingLine?.value?.coordinates[0]).toEqual([0, 0]);
  });

  it("formats values for the table", () => {
    expect(formatValue(fieldByPath("maxHeight"), 15)).toBe("15 m");
    expect(formatValue(fieldByPath("maxHeight"), null)).toBe("unknown");
    expect(formatValue(fieldByPath("allowedFunctions"), ["Wonen", "Kantoor"])).toBe("Wonen, Kantoor");
    expect(formatValue(fieldByPath("bouwvlak"), { coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] })).toBe("polygon, 4 vertices, 100 m²");
  });
});

describe("applyExtracted", () => {
  const prov = { source: "SAMPLE plan", quote: "ten hoogste 13 m", status: "extracted" as const };

  it("puts extracted values in with their quote, and overrides win on top", () => {
    const base = unknownConstraints("fixture");
    const c = applyExtracted(base, {
      fields: { maxHeight: { value: 13, unit: "m", prov }, "setbacks.rear": { value: 5, unit: "m", prov } },
      notes: [{ value: "Kap verplicht", prov }],
    });
    expect(getField(c, "maxHeight")).toEqual({ value: 13, unit: "m", prov });
    expect(c.setbacks.rear.prov.status).toBe("extracted");
    expect(c.notes).toHaveLength(1);
    const over = applyOverrides(c, { maxHeight: 9 });
    expect(getField(over, "maxHeight")).toMatchObject({ value: 9, prov: { source: "User override (was 13 m, extracted)", status: "user_override" } });
    expect(base.maxHeight.value).toBeNull();
  });

  it("changes nothing when nothing was extracted", () => {
    const base = unknownConstraints("fixture");
    expect(applyExtracted(base, { fields: {}, notes: [] })).toBe(base);
  });
});
