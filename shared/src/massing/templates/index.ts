import type { Typology } from "../../schemas/massing";
import { courtyard } from "./courtyard";
import { lBlock } from "./lBlock";
import { slab } from "./slab";
import type { Template } from "./types";

export type { Template, TemplateContext, Shaper, Prepared } from "./types";
export { MIN_COURT, MIN_DEPTH } from "./courtyard";

/** Implemented typologies. A new typology = one template file + one line here. */
export const TEMPLATES: Partial<Record<Typology, Template>> = { slab, l_block: lBlock, courtyard };

export const TYPOLOGY_LABELS: Record<Typology, string> = {
  slab: "Slab",
  l_block: "L-block",
  courtyard: "Courtyard",
  tower_podium: "Tower on podium",
  stepped: "Stepped",
};
