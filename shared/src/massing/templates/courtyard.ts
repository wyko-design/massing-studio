import polygonClipping from "polygon-clipping";
import { boxOf, clipRect, rect, type Box } from "../fit";
import { fmtM } from "../format";
import type { Template, TemplateContext } from "./types";

/** Narrowest wing worth building around a court, m. */
export const MIN_DEPTH = 5;
/** Smallest open court, m (each side). */
export const MIN_COURT = 8;

/** The court rectangle inside an outer box, or null when it would be smaller than MIN_COURT. */
function courtIn(b: Box, d: number) {
  const [u0, v0, u1, v1] = [b.u0 + d, b.v0 + d, b.u1 - d, b.v1 - d];
  return u1 - u0 >= MIN_COURT && v1 - v0 >= MIN_COURT ? rect(u0, v0, u1, v1) : null;
}

/** Envelope ∩ the frame box scaled about its centre by s. */
function outerAt(ctx: TemplateContext, s: number) {
  const { box } = ctx;
  const cu = (box.u0 + box.u1) / 2;
  const cv = (box.v0 + box.v1) / 2;
  const hu = ((box.u1 - box.u0) / 2) * s;
  const hv = ((box.v1 - box.v0) / 2) * s;
  return clipRect(ctx.env, cu - hu, cv - hv, cu + hu, cv + hv);
}

/**
 * Perimeter block: the envelope clipped to a box that grows from the centre with s, minus a court
 * inset by d from the outer extent. When no MIN_COURT court fits, the block is solid.
 */
export const courtyard: Template = {
  label: "Courtyard",
  variants: 1,
  prepare({ box }, d) {
    const span = Math.min(box.u1 - box.u0, box.v1 - box.v0);
    const maxDepth = (span - MIN_COURT) / 2;
    if (maxDepth < MIN_DEPTH) {
      return {
        fallback: `Courtyard needs at least 2 × ${fmtM(MIN_DEPTH)} wings + an ${fmtM(MIN_COURT)} court = ${fmtM(2 * MIN_DEPTH + MIN_COURT)} across; the envelope is ${fmtM(span)}, so it is built as a slab.`,
      };
    }
    if (d > maxDepth) {
      return { depth: maxDepth, clamps: [`Depth ${fmtM(d)} leaves no ${fmtM(MIN_COURT)} court in a ${fmtM(span)} envelope; clamped to ${fmtM(maxDepth)}.`] };
    }
    return { depth: d, clamps: [] };
  },
  shaper(ctx, d) {
    return (s) => {
      const outer = outerAt(ctx, s);
      const ob = boxOf(outer);
      const court = ob && courtIn(ob, d);
      return court ? polygonClipping.difference(outer, court) : outer;
    };
  },
  review(ctx, d, s) {
    const ob = boxOf(outerAt(ctx, s));
    if (!ob || courtIn(ob, d)) return [];
    return [`Courtyard: at this coverage target no ${fmtM(MIN_COURT)} court fits, so it is built as a solid block.`];
  },
};
