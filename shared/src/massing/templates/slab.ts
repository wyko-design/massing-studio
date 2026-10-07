import { boxOf, clipRect } from "../fit";
import type { Template } from "./types";

/** Band positions across the envelope, as a share of the slack: front-flush first so it wins ties. */
const OFFSETS = [0, 1, 0.5, 0.25, 0.75];

/** One bar of depth d along the building axis, grown from its centre. */
export const slab: Template = {
  label: "Slab",
  variants: OFFSETS.length,
  shaper({ env, box }, d, variant) {
    const slack = Math.max(0, box.v1 - box.v0 - d);
    const top = box.v1 - OFFSETS[variant]! * slack;
    const bottom = top - d;
    const band = boxOf(clipRect(env, box.u0, bottom, box.u1, top));
    if (!band) return () => [];
    const mid = (band.u0 + band.u1) / 2;
    const half = (band.u1 - band.u0) / 2;
    return (s) => clipRect(env, mid - s * half, bottom, mid + s * half, top);
  },
};
