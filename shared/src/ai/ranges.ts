import type { MassingParams, Programme } from "../schemas/massing";

export type Range = { min: number; max: number; step: number; unit?: string };

type NumericParam = "floors" | "depth" | "coverageTarget" | "groundFloorHeight" | "floorHeight";

/** Input ranges of the massing sliders. The UI and the AI layer share them. */
export const PARAM_RANGES: Record<NumericParam, Range> = {
  floors: { min: 1, max: 12, step: 1 },
  depth: { min: 4, max: 40, step: 0.5, unit: "m" },
  coverageTarget: { min: 0.1, max: 1, step: 0.01 },
  groundFloorHeight: { min: 2.7, max: 5, step: 0.1, unit: "m" },
  floorHeight: { min: 2.6, max: 4, step: 0.1, unit: "m" },
};

/** Input ranges of the programme sliders (SPEC §2: roughly 5–25 apartments). */
export const PROGRAMME_RANGES: Record<keyof Programme, Range> = {
  targetUnits: { min: 5, max: 25, step: 1 },
  avgUnitSize: { min: 35, max: 120, step: 5, unit: "m²" },
  netToGross: { min: 0.6, max: 0.9, step: 0.01 },
};

const PARAM_NAMES: Record<NumericParam, string> = {
  floors: "floors",
  depth: "depth",
  coverageTarget: "coverage",
  groundFloorHeight: "ground floor height",
  floorHeight: "floor height",
};

const PROGRAMME_NAMES: Record<keyof Programme, string> = {
  targetUnits: "target units",
  avgUnitSize: "average unit size",
  netToGross: "net-to-gross",
};

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length;
const fmt = (x: number, r: Range) => `${x}${r.unit ? ` ${r.unit}` : ""}`;

/** Snap to the slider step and clamp to the range. Returns the clamp message when the range bit. */
export function fitRange(value: number, r: Range, name: string, who: string): { value: number; clamp: string | null } {
  const snapped = Number((Math.round((value - r.min) / r.step) * r.step + r.min).toFixed(decimals(r.step)));
  const clamped = Math.min(r.max, Math.max(r.min, snapped));
  if (value < r.min - 1e-9 || value > r.max + 1e-9) {
    const bound = value < r.min ? `minimum is ${fmt(r.min, r)}` : `range allows ${fmt(r.max, r)}`;
    return { value: clamped, clamp: `${who} asked for ${name} ${fmt(value, r)}; the input ${bound}.` };
  }
  return { value: clamped, clamp: null };
}

/** Params snapped to the slider steps and clamped to the slider ranges; every clamp is recorded. */
export function clampToRanges(p: MassingParams, who = "AI"): { params: MassingParams; clamps: string[] } {
  const params = { ...p };
  const clamps: string[] = [];
  for (const key of Object.keys(PARAM_RANGES) as NumericParam[]) {
    const r = fitRange(p[key], PARAM_RANGES[key], PARAM_NAMES[key], who);
    params[key] = r.value;
    if (r.clamp) clamps.push(r.clamp);
  }
  return { params, clamps };
}

/** One programme value snapped and clamped to its slider range. */
export const fitProgramme = (key: keyof Programme, value: number, who = "Brief") =>
  fitRange(value, PROGRAMME_RANGES[key], PROGRAMME_NAMES[key], who);
