import type { Envelope, SiteConstraints } from "../schemas/constraints";
import type { MassingParams } from "../schemas/massing";
import { OPTION_COLOURS, type PresetId } from "../schemas/ai";
import { generateMassing, type MassingSite } from "./generateMassing";

export type Preset = {
  /** Name on the tab, in headings and in the report. */
  name: string;
  intent: string;
  tradeOffs: string[];
  /** What the strategy asks for before the site is read. `floors: "max"` = as many as the rules allow. */
  wish: Omit<MassingParams, "floors" | "colour"> & { floors: number | "max" };
};

/** Floors asked for by a "max" preset: the input range's top when a height limit will cut it, fewer when none is known. */
const MAX_FLOORS = { limited: 12, unlimited: 6 };

/** The four fixed strategies. Choices only: code fits them to the site, the generator computes everything else. */
export const PRESETS: Record<PresetId, Preset> = {
  homes: {
    name: "Most floor area",
    intent: "A closed courtyard block to the street, as tall and as full as the rules allow. Every metre of the envelope carries floor area.",
    tradeOffs: ["Little open space on the plot", "Inner corners get less daylight", "The tallest and heaviest of the options"],
    wish: { typology: "courtyard", floors: "max", groundFloorHeight: 3.5, floorHeight: 3, depth: 12, alignment: "street", coverageTarget: 0.7, roof: "flat" },
  },
  daylight: {
    name: "Most daylight",
    intent: "One shallow slab turned east–west, so the long facades face south and every home looks out on both sides.",
    tradeOffs: ["Fewer homes than a full block", "Ignores the street line", "Long, exposed facades"],
    wish: { typology: "slab", floors: 5, groundFloorHeight: 3.5, floorHeight: 3, depth: 9, alignment: "sun", coverageTarget: 0.35, roof: "flat" },
  },
  garden: {
    name: "Most greenery",
    intent: "The smallest footprint, stacked as high as allowed, to leave most of the plot green.",
    tradeOffs: ["Tall next to the neighbours", "Few homes on each floor", "Needs lifts and a deeper structure"],
    wish: { typology: "slab", floors: "max", groundFloorHeight: 3.5, floorHeight: 3, depth: 12, alignment: "street", coverageTarget: 0.2, roof: "flat" },
  },
  low: {
    name: "Low development",
    intent: "A low L-block with a pitched roof that follows the street and keeps to the scale of the houses around it.",
    tradeOffs: ["Fewest floors, so fewer homes", "Covers more ground than the taller options", "Roof space only partly usable"],
    wish: { typology: "l_block", floors: 3, groundFloorHeight: 3.5, floorHeight: 3, depth: 10, alignment: "street", coverageTarget: 0.45, roof: "pitched" },
  },
};

/** A preset before the site is known: its wish, with "max" read as the unlimited count. */
export function presetWish(id: PresetId): MassingParams {
  const { wish } = PRESETS[id];
  return { ...wish, floors: wish.floors === "max" ? MAX_FLOORS.unlimited : wish.floors, colour: OPTION_COLOURS[id] };
}

/**
 * A preset fitted to the site, so it starts without clamps: coverage within the max coverage rule, floors as many as
 * the generator can build (height, gutter height, FAR). The user's slider edits sit on top of this.
 */
export function presetParams(id: PresetId, envelope: Envelope, rules: SiteConstraints, site: MassingSite): MassingParams {
  const { wish } = PRESETS[id];
  const maxCoverage = rules.maxCoverage?.value ?? null;
  const floors = wish.floors === "max" ? (rules.maxHeight.value === null ? MAX_FLOORS.unlimited : MAX_FLOORS.limited) : wish.floors;
  const asked: MassingParams = {
    ...wish,
    floors,
    coverageTarget: maxCoverage === null ? wish.coverageTarget : Math.min(wish.coverageTarget, maxCoverage),
    colour: OPTION_COLOURS[id],
  };
  const built = generateMassing(envelope, rules, asked, site).metrics.floors;
  return built > 0 ? { ...asked, floors: Math.min(floors, built) } : asked;
}
