import type { MultiPolygon } from "polygon-clipping";
import type { Constrained, Envelope, SiteConstraints } from "../schemas/constraints";
import type { MassingParams, MassingResult, Programme, Volume } from "../schemas/massing";
import type { Ring } from "../schemas/site";
import { distanceOutside, openRing, polygonWithHolesArea, toCcw, toGeoPolygon } from "../geo/planar";
import { checkCompliance } from "./compliance";
import { boxOf, mpArea, solveExtent } from "./fit";
import { fmtM, fmtM2, fmtRatio, statusLabel } from "./format";
import { axisAngle, buildFrame, toLocalFrame, type Frame } from "./frame";
import { computeMetrics } from "./metrics";
import { TEMPLATES, TYPOLOGY_LABELS, type Template, type TemplateContext } from "./templates";

/** Fixed pitch of a pitched roof, degrees. An assumption, listed in every pitched result. */
export const ROOF_PITCH = 40;
/** Clip slivers smaller than this are dropped, m². */
const MIN_PART_AREA = 1;
/** A coverage shortfall under this (absolute, 0–1) is fitting noise, not worth a clamp. */
const SHORTFALL = 0.02;
const EPS = 1e-9;

/** What generateMassing needs about the site and programme beyond the envelope and rules. */
export type MassingSite = {
  /** Parcel area, m²: the base for coverage and FAR. */
  parcelArea: number;
  programme: Programme;
};

type Part = { ring: Ring[]; across: number };

/** Wall top for n floors: ground floor plus (n − 1) upper floors. */
const wallTopOf = (n: number, p: MassingParams) => (n <= 0 ? 0 : p.groundFloorHeight + (n - 1) * p.floorHeight);

/** "3.5 m + 3 × 3 m + 2.5 m roof = 15 m" */
function heightBreakdown(n: number, p: MassingParams, ridge: number): string {
  const terms = [fmtM(p.groundFloorHeight)];
  if (n > 1) terms.push(`${n - 1} × ${fmtM(p.floorHeight)}`);
  if (ridge > 0) terms.push(`${fmtM(ridge)} roof`);
  const total = wallTopOf(n, p) + ridge;
  return terms.length > 1 ? `${terms.join(" + ")} = ${fmtM(total)}` : fmtM(total);
}

/** Largest n with ground + (n − 1) × floor ≤ limit; 0 when not even the ground floor fits. */
const floorsWithin = (limit: number, p: MassingParams) =>
  limit + EPS < p.groundFloorHeight ? 0 : Math.floor((limit - p.groundFloorHeight) / p.floorHeight + EPS) + 1;

/**
 * Floors after the height, gutter-height and FAR rules. Each rule that bites adds a clamp naming
 * the asked and the allowed number; an unknown rule never limits (and says so for max height).
 */
function clampFloors(
  p: MassingParams,
  rules: SiteConstraints,
  footprint: number,
  parcelArea: number,
  ridge: number,
  clamps: string[],
  assumptions: string[],
): number {
  let floors = p.floors;
  const asked = `Asked for ${p.floors} floor${p.floors === 1 ? "" : "s"}`;
  const st = (c: Constrained<number>) => statusLabel(c.prov);

  const h = rules.maxHeight.value;
  if (h === null) assumptions.push("Max height unknown: floors are not limited by height.");
  else {
    const n = floorsWithin(h - ridge, p);
    if (n === 0) clamps.push(`Max height ${fmtM(h)} (${st(rules.maxHeight)}) is below a single floor (${heightBreakdown(1, p, ridge)}); nothing can be built.`);
    else if (n < floors) clamps.push(`${asked}; max height ${fmtM(h)} (${st(rules.maxHeight)}) allows ${n} (${heightBreakdown(n, p, ridge)}).`);
    floors = Math.min(floors, n);
  }

  const g = rules.maxGutterHeight;
  if (g && g.value !== null) {
    const n = floorsWithin(g.value, p);
    if (n === 0) clamps.push(`Max gutter height ${fmtM(g.value)} (${st(g)}) is below a single floor (${fmtM(p.groundFloorHeight)}); nothing can be built.`);
    else if (n < p.floors) clamps.push(`${asked}; max gutter height ${fmtM(g.value)} (${st(g)}) allows ${n} (wall top ${fmtM(wallTopOf(n, p))}).`);
    floors = Math.min(floors, n);
  }

  const far = rules.maxFAR;
  if (far && far.value !== null && footprint > 0) {
    const n = Math.floor((far.value * parcelArea) / footprint + EPS);
    if (n === 0) clamps.push(`Max FAR ${fmtRatio(far.value)} (${st(far)}) does not allow one floor of ${fmtM2(footprint)} on a ${fmtM2(parcelArea)} parcel; nothing can be built.`);
    else if (n < p.floors) clamps.push(`${asked}; max FAR ${fmtRatio(far.value)} (${st(far)}) allows ${n} (GFA ${fmtM2(n * footprint)} on a ${fmtM2(parcelArea)} parcel).`);
    floors = Math.min(floors, n);
  }
  return floors;
}

/** The template for the requested typology, or the slab with a clamp saying why. */
function pickTemplate(p: MassingParams, clamps: string[]): Template {
  const t = TEMPLATES[p.typology];
  if (t) return t;
  clamps.push(`${TYPOLOGY_LABELS[p.typology]} is not implemented yet; built as a slab.`);
  return TEMPLATES.slab!;
}

/**
 * polygon-clipping can throw on nearly coincident edges ("Unable to complete output ring"). A
 * slider must never crash the app, so a failed shape counts as "does not fit" (null).
 */
const safely =
  (shape: (s: number) => MultiPolygon) =>
  (s: number): MultiPolygon | null => {
    try {
      return shape(s);
    } catch {
      return null;
    }
  };

/** Fit a template: prepare (may adjust depth or fall back), pick the best variant, solve the extent. */
function fitTemplate(template: Template, ctx: TemplateContext, depth: number, target: number, clamps: string[]) {
  const prep = template.prepare?.(ctx, depth);
  if (prep && "fallback" in prep) {
    clamps.push(prep.fallback);
    return fitTemplate(TEMPLATES.slab!, ctx, depth, target, clamps);
  }
  if (prep) {
    clamps.push(...prep.clamps);
    depth = prep.depth;
  }
  let best = { variant: 0, area: -1 };
  for (let v = 0; v < template.variants; v++) {
    const area = mpArea(safely(template.shaper(ctx, depth, v))(1) ?? []);
    if (area > best.area + EPS) best = { variant: v, area };
  }
  const fit = solveExtent(safely(template.shaper(ctx, depth, best.variant)), target);
  clamps.push(...(template.review?.(ctx, depth, fit.s) ?? []));
  return { template, depth, shape: fit.shape, area: fit.area, maxArea: best.area };
}

/** Frame parts back to the local frame, slivers dropped, with their width across the axis. */
function toLocalParts(shape: MultiPolygon, frame: Frame): Part[] {
  return shape
    .filter((poly) => polygonWithHolesArea(poly) >= MIN_PART_AREA)
    .map((poly) => {
      const b = boxOf([poly])!;
      return { ring: toGeoPolygon(poly.map((r) => toLocalFrame(openRing(r), frame))).coordinates, across: b.v1 - b.v0 };
    });
}

/**
 * Farthest any footprint vertex or edge midpoint lies outside the envelope, m. A check on the
 * clipping, without another boolean operation (polygon-clipping can fail on the coincident edges
 * that clipping leaves behind).
 */
function maxOutside(volumes: Volume[], envelopeRings: Ring[]): number {
  let worst = 0;
  for (const v of volumes) {
    for (const ring of v.footprint.coordinates) {
      const r = openRing(ring);
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length]!;
        worst = Math.max(worst, distanceOutside(a, envelopeRings), distanceOutside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], envelopeRings));
      });
    }
  }
  return worst;
}

function emptyResult(rules: SiteConstraints, envelope: Envelope, clamps: string[], assumptions: string[]): MassingResult {
  return {
    volumes: [],
    metrics: { footprint: 0, gfa: 0, far: 0, coverage: 0, height: 0, floors: 0, estUnits: 0, facadeSunScore: 0 },
    compliance: checkCompliance(rules, envelope, null),
    clamps,
    assumptions,
  };
}

/**
 * SPEC §8: realise one massing option inside the envelope. Pure and deterministic; numbers and
 * geometry come from here, never from the model. Every place the result departs from `p` is a
 * clamp; every input taken as given is an assumption. Geometry in the envelope's (local) frame.
 */
export function generateMassing(envelope: Envelope, rules: SiteConstraints, p: MassingParams, site: MassingSite): MassingResult {
  const clamps: string[] = [];
  const { programme, parcelArea } = site;
  const assumptions: string[] = [
    `Units: GFA × net-to-gross ${fmtRatio(programme.netToGross)} ÷ ${fmtM2(programme.avgUnitSize)} average unit (programme assumptions).`,
    "Sun score: share of wall area facing south/north rather than east/west (1 = long facades face south); party walls and shading by context are ignored.",
  ];

  const rings = envelope.footprint.coordinates;
  if (!rings.length) {
    clamps.push("The envelope has no buildable area, so nothing is generated.");
    return emptyResult(rules, envelope, clamps, assumptions);
  }

  const template = pickTemplate(p, clamps);
  const outer = toCcw(openRing(rings[0]!));
  const frame = buildFrame([outer, ...rings.slice(1).map(openRing)], axisAngle(outer, rules, p.alignment, assumptions));
  if (!frame) {
    clamps.push("The envelope has no buildable area, so nothing is generated.");
    return emptyResult(rules, envelope, clamps, assumptions);
  }
  const ctx: TemplateContext = { env: frame.env, box: frame.box };

  // depth: no deeper than the envelope across the building axis
  const across = frame.box.v1 - frame.box.v0;
  let depth = p.depth;
  if (depth > across + 1e-6) {
    clamps.push(`Depth ${fmtM(depth)} is more than the envelope's ${fmtM(across)} across the building axis; clamped to ${fmtM(across)}.`);
    depth = across;
  }

  // coverage: the target, capped by the max coverage rule
  let coverage = p.coverageTarget;
  const maxCov = rules.maxCoverage;
  if (maxCov && maxCov.value !== null && coverage > maxCov.value + EPS) {
    clamps.push(`Coverage target ${fmtRatio(coverage)} exceeds the max coverage ${fmtRatio(maxCov.value)} (${statusLabel(maxCov.prov)}); clamped to ${fmtRatio(maxCov.value)}.`);
    coverage = maxCov.value;
  }

  const fit = fitTemplate(template, ctx, depth, coverage * parcelArea, clamps);
  const parts = toLocalParts(fit.shape, frame);
  const footprint = parts.reduce((s, part) => s + polygonWithHolesArea(part.ring), 0);
  const reached = parcelArea > 0 ? footprint / parcelArea : 0;
  if (coverage - reached > SHORTFALL) {
    const kind = fit.template.label.toLowerCase();
    clamps.push(
      `Coverage target ${fmtRatio(coverage)} reached ${fmtRatio(reached)}: a ${kind} ${fmtM(fit.depth)} deep fits at most ${fmtM2(fit.maxArea)} in the ${fmtM2(mpArea(frame.env))} envelope.`,
    );
  }
  if (!parts.length) {
    if (coverage <= 0) clamps.push("Coverage target 0 leaves no footprint, so nothing is generated.");
    return emptyResult(rules, envelope, clamps, assumptions);
  }

  // roof and floors
  const pitch = (ROOF_PITCH * Math.PI) / 180;
  const ridgeOf = (part: Part) => (p.roof === "pitched" ? (Math.min(fit.depth, part.across) / 2) * Math.tan(pitch) : 0);
  const ridge = Math.max(...parts.map(ridgeOf));
  if (p.roof === "pitched") {
    assumptions.push(`Pitched roof at ${ROOF_PITCH}°, one ridge per volume along the building axis; the attic is not counted in GFA.`);
  }
  const floors = clampFloors(p, rules, footprint, parcelArea, ridge, clamps, assumptions);
  if (floors < 1) return emptyResult(rules, envelope, clamps, assumptions);

  const wallTop = wallTopOf(floors, p);
  const volumes: Volume[] = parts.map((part) => ({
    footprint: { type: "Polygon", coordinates: part.ring },
    zBase: 0,
    height: wallTop,
    floors,
    ...(p.roof === "pitched" ? { roof: { pitchDeg: ROOF_PITCH, ridgeAngle: frame.angle, ridgeHeight: ridgeOf(part) } } : {}),
  }));

  const metrics = computeMetrics(volumes, parcelArea, programme);
  const outsideEnvelope = maxOutside(volumes, rings);
  return {
    volumes,
    metrics,
    compliance: checkCompliance(rules, envelope, { metrics, wallTop, outsideEnvelope }),
    clamps,
    assumptions,
  };
}
