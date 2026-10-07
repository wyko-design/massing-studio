import polygonClipping, { type Pair } from "polygon-clipping";
import { boxOf, clipRect, rect } from "../fit";
import { fmtM } from "../format";
import type { Template } from "./types";

/** Below this the side wing adds nothing beyond the front wing. */
const MIN_WING = 1;

/**
 * Front wing of depth d along the axis plus a side wing of width d at one end, running from the
 * front towards the back. Both arms grow with s from the shared corner. Variant 0 = corner at the
 * low-u end, 1 = high-u end.
 */
export const lBlock: Template = {
  label: "L-block",
  variants: 2,
  prepare({ box }, d) {
    const across = box.v1 - box.v0;
    if (across - d >= MIN_WING) return { depth: d, clamps: [] };
    return {
      depth: d,
      clamps: [`L-block: the envelope is ${fmtM(across)} across the building axis, so a ${fmtM(d)} front wing leaves no room for the side wing; it reads as a slab.`],
    };
  },
  shaper({ env, box }, d, variant) {
    const top = box.v1;
    const front = top - d;
    const band = boxOf(clipRect(env, box.u0, front, box.u1, top));
    if (!band) return () => [];
    const atLow = variant === 0;
    const corner = atLow ? band.u0 : band.u1;
    const [wu0, wu1] = atLow ? [corner, corner + d] : [corner - d, corner];
    const wing = boxOf(clipRect(env, wu0, box.v0, wu1, top));
    const armLen = band.u1 - band.u0;
    const wingLen = wing ? top - wing.v0 : 0;
    return (s) => {
      const arm = atLow ? rect(corner, front, corner + s * armLen, top) : rect(corner - s * armLen, front, corner, top);
      const side = rect(wu0, top - s * wingLen, wu1, top);
      const parts = [arm, side].filter((p): p is Pair[][] => p !== null);
      if (!parts.length) return [];
      return polygonClipping.intersection(env, polygonClipping.union(parts[0]!, ...parts.slice(1)));
    };
  },
};
