import { useMemo } from "react";
import { create } from "zustand";
import {
  DEFAULT_PROGRAMME,
  PRESETS,
  generateMassing,
  presetParams,
  presetWish,
  resolveEnvelope,
  type Direction,
  type Envelope,
  type MassingParams,
  type MassingResult,
  type OptionId,
  type PresetId,
  type Programme,
  type SiteConstraints,
} from "@massing/shared";
import { useConstraints, useEnvelope, useSiteStore } from "./siteStore";

export { OPTION_IDS, PRESET_IDS, type OptionId, type PresetId } from "@massing/shared";

export const isPreset = (id: OptionId): id is PresetId => id !== "custom";

/** The AI's option from the brief, as it answered, plus what the user changed since. */
export type CustomOption = { direction: Direction; edits: Partial<MassingParams> };

const noEdits = (): Record<PresetId, Partial<MassingParams>> => ({ homes: {}, daylight: {}, garden: {}, low: {} });

type MassingState = {
  programme: Programme;
  /** Slider changes on top of each preset; the preset itself is fitted to the site by code. */
  edits: Record<PresetId, Partial<MassingParams>>;
  /** Null until "Generate directions" answers, and again after the user deletes it. */
  custom: CustomOption | null;
  active: OptionId;
  setProgramme: (patch: Partial<Programme>) => void;
  setParams: (id: OptionId, patch: Partial<MassingParams>) => void;
  resetOption: (id: OptionId) => void;
  setCustom: (direction: Direction) => void;
  deleteCustom: () => void;
  setActive: (id: OptionId) => void;
};

/** Sliders only touch this store; nothing here calls the server or the LLM. */
export const useMassingStore = create<MassingState>()((set) => ({
  programme: DEFAULT_PROGRAMME,
  edits: noEdits(),
  custom: null,
  active: "homes",
  setProgramme: (patch) => set((s) => ({ programme: { ...s.programme, ...patch } })),
  setParams: (id, patch) =>
    set((s) =>
      isPreset(id)
        ? { edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } }
        : s.custom
          ? { custom: { ...s.custom, edits: { ...s.custom.edits, ...patch } } }
          : {},
    ),
  resetOption: (id) => set((s) => (isPreset(id) ? { edits: { ...s.edits, [id]: {} } } : s.custom ? { custom: { ...s.custom, edits: {} } } : {})),
  setCustom: (direction) => set({ custom: { direction, edits: {} } }),
  deleteCustom: () => set({ custom: null }),
  setActive: (active) => set({ active }),
}));

type SiteInputs = { envelope: Envelope; constraints: SiteConstraints; parcelArea: number };

/** An option's params and whether the user changed them; null for a custom option that does not exist. */
export type OptionParams = { params: MassingParams; edited: boolean };

function resolveOption(id: OptionId, s: Pick<MassingState, "edits" | "custom" | "programme">, site: SiteInputs | null): OptionParams | null {
  let base: MassingParams;
  let edits: Partial<MassingParams>;
  if (isPreset(id)) {
    base = site ? presetParams(id, site.envelope, site.constraints, { parcelArea: site.parcelArea, programme: s.programme }) : presetWish(id);
    edits = s.edits[id];
  } else {
    if (!s.custom) return null;
    base = s.custom.direction.params;
    edits = s.custom.edits;
  }
  const edited = (Object.keys(edits) as (keyof MassingParams)[]).some((k) => edits[k] !== base[k]);
  return { params: { ...base, ...edits }, edited };
}

/** The option's params: the preset fitted to the site, or the AI's, with the user's slider changes on top. */
export function useOptionParams(id: OptionId): OptionParams | null {
  const edits = useMassingStore((s) => s.edits);
  const custom = useMassingStore((s) => s.custom);
  const programme = useMassingStore((s) => s.programme);
  const parcelArea = useSiteStore((s) => s.scene?.parcel.areaM2);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  // a preset only depends on its own edits; custom only on the custom option
  const own = isPreset(id) ? edits[id] : custom;
  return useMemo(
    () => resolveOption(id, { edits, custom, programme }, envelope && constraints && parcelArea ? { envelope, constraints, parcelArea } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, own, programme, envelope, constraints, parcelArea],
  );
}

/** Massing of one option, regenerated whenever its params, the programme, rules or envelope change. Null when there is no such option yet. */
export function useMassing(id: OptionId): MassingResult | null {
  const option = useOptionParams(id);
  const programme = useMassingStore((s) => s.programme);
  const parcelArea = useSiteStore((s) => s.scene?.parcel.areaM2);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  const params = option?.params;
  return useMemo(
    () => (params && envelope && constraints && parcelArea ? generateMassing(envelope, constraints, params, { parcelArea, programme }) : null),
    [envelope, constraints, parcelArea, params, programme],
  );
}

function siteNow(): SiteInputs | null {
  const { scene } = useSiteStore.getState();
  const constraints = useSiteStore.getState().effectiveConstraints();
  if (!scene || !constraints) return null;
  return { envelope: resolveEnvelope(scene.parcel.ring, constraints), constraints, parcelArea: scene.parcel.areaM2 };
}

/** Same as `useOptionParams`, for code outside React (the PDF report): reads the current stores. */
export function optionParams(id: OptionId): MassingParams | null {
  return resolveOption(id, useMassingStore.getState(), siteNow())?.params ?? null;
}

/** Same result as `useMassing`, for code outside React (the PDF report): reads the current stores. */
export function computeMassing(id: OptionId): MassingResult | null {
  const site = siteNow();
  const params = optionParams(id);
  if (!site || !params) return null;
  return generateMassing(site.envelope, site.constraints, params, { parcelArea: site.parcelArea, programme: useMassingStore.getState().programme });
}

/** Names and words of an option: the preset's, or what the AI wrote for the custom one. */
export type OptionText = { tab: string; name: string; intent: string | null; tradeOffs: string[] };

export function optionText(id: OptionId, custom: CustomOption | null): OptionText {
  if (isPreset(id)) {
    const p = PRESETS[id];
    return { tab: p.tab, name: p.name, intent: p.intent, tradeOffs: p.tradeOffs };
  }
  const d = custom?.direction;
  return { tab: "Custom", name: d?.name ?? "Custom", intent: d?.intent ?? null, tradeOffs: d?.tradeOffs ?? [] };
}

export function useOptionText(id: OptionId): OptionText {
  const custom = useMassingStore((s) => s.custom);
  return useMemo(() => optionText(id, custom), [id, custom]);
}
