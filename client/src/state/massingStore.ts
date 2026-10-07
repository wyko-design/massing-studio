import { useMemo } from "react";
import { create } from "zustand";
import {
  DEFAULT_PROGRAMME,
  OPTION_COLOURS,
  type OptionId,
  generateMassing,
  resolveEnvelope,
  type MassingParams,
  type MassingResult,
  type Programme,
} from "@massing/shared";
import { useConstraints, useEnvelope, useSiteStore } from "./siteStore";

export { OPTION_IDS, type OptionId } from "@massing/shared";

const base: Omit<MassingParams, "typology" | "colour"> = {
  floors: 4,
  groundFloorHeight: 3.5,
  floorHeight: 3,
  depth: 10,
  alignment: "street",
  coverageTarget: 0.5,
  roof: "flat",
};

/** Hand-set starting points, one per tab. P8 replaces them with the strategy generator's output. */
export const initialOptions = (): Record<OptionId, MassingParams> => ({
  A: { ...base, typology: "slab", colour: OPTION_COLOURS.A },
  B: { ...base, typology: "l_block", depth: 8, floors: 5, alignment: "sun", colour: OPTION_COLOURS.B },
  C: { ...base, typology: "courtyard", depth: 9, floors: 4, coverageTarget: 0.55, colour: OPTION_COLOURS.C },
});

type MassingState = {
  programme: Programme;
  options: Record<OptionId, MassingParams>;
  active: OptionId;
  setProgramme: (patch: Partial<Programme>) => void;
  setParams: (id: OptionId, patch: Partial<MassingParams>) => void;
  resetOption: (id: OptionId) => void;
  setActive: (id: OptionId) => void;
};

/** Sliders only touch this store; nothing here calls the server or the LLM. */
export const useMassingStore = create<MassingState>()((set) => ({
  programme: DEFAULT_PROGRAMME,
  options: initialOptions(),
  active: "A",
  setProgramme: (patch) => set((s) => ({ programme: { ...s.programme, ...patch } })),
  setParams: (id, patch) => set((s) => ({ options: { ...s.options, [id]: { ...s.options[id], ...patch } } })),
  resetOption: (id) => set((s) => ({ options: { ...s.options, [id]: initialOptions()[id] } })),
  setActive: (active) => set({ active }),
}));

/** Massing of one option, regenerated whenever its params, the programme, rules or envelope change. */
export function useMassing(id: OptionId): MassingResult | null {
  const params = useMassingStore((s) => s.options[id]);
  const programme = useMassingStore((s) => s.programme);
  const parcelArea = useSiteStore((s) => s.scene?.parcel.areaM2);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  return useMemo(
    () => (envelope && constraints && parcelArea ? generateMassing(envelope, constraints, params, { parcelArea, programme }) : null),
    [envelope, constraints, parcelArea, params, programme],
  );
}

/** Same result as `useMassing`, for code outside React (the PDF report): reads the current stores. */
export function computeMassing(id: OptionId): MassingResult | null {
  const { scene } = useSiteStore.getState();
  const constraints = useSiteStore.getState().effectiveConstraints();
  const { options, programme } = useMassingStore.getState();
  if (!scene || !constraints) return null;
  const envelope = resolveEnvelope(scene.parcel.ring, constraints);
  return generateMassing(envelope, constraints, options[id], { parcelArea: scene.parcel.areaM2, programme });
}
