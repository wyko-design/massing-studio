import { create } from "zustand";
import {
  DEFAULT_PRIORITIES,
  type ExtractRulesResult,
  type GenerateDirectionsRequest,
  type InterpretBriefResult,
  type Priorities,
  type Typology,
} from "@massing/shared";
import * as api from "../api/ai";
import { useMassingStore } from "./massingStore";
import { useSiteStore } from "./siteStore";

export type Call<T> = { status: "idle" | "loading" | "error" | "done"; result: T | null; error: string | null; cached: boolean };
const idle = <T>(): Call<T> => ({ status: "idle", result: null, error: null, cached: false });

type AiState = {
  brief: string;
  priorities: Priorities;
  typologyHints: Typology[];
  interpret: Call<InterpretBriefResult>;
  /** The custom option's call. Its answer lives in the massing store (`custom`), where the user edits or deletes it. */
  directions: Call<{ warnings: string[] }>;
  rules: Call<ExtractRulesResult>;
  setBrief: (brief: string) => void;
  setPriority: (key: keyof Priorities, value: number) => void;
  interpretBrief: () => Promise<void>;
  generateDirections: () => Promise<void>;
  /** Deletes the custom option, so the brief can be generated again. */
  deleteCustom: () => void;
  extractRules: () => Promise<void>;
  clearRules: () => void;
};

const fail = <T>(e: unknown): Call<T> => ({ status: "error", result: null, error: api.describeError(e), cached: false });

/**
 * The only place the UI calls the LLM (SPEC §7). Sliders never reach this store. Each call has its
 * own status, so sliders stay live while a call is pending, and a late answer for a site that has
 * been replaced in the meantime is dropped.
 */
export const useAiStore = create<AiState>()((set, get) => ({
  brief: "",
  priorities: DEFAULT_PRIORITIES,
  typologyHints: [],
  interpret: idle(),
  directions: idle(),
  rules: idle(),
  setBrief: (brief) => set({ brief }),
  setPriority: (key, value) => set((s) => ({ priorities: { ...s.priorities, [key]: value } })),

  interpretBrief: async () => {
    const { brief } = get();
    const { programme, setProgramme } = useMassingStore.getState();
    const constraints = effectiveConstraints();
    set({ interpret: { ...idle(), status: "loading" } });
    try {
      const { data, cached } = await api.interpretBrief({ brief, programme, ...(constraints ? { constraints } : {}) });
      setProgramme(data.programme);
      set({ priorities: data.priorities, typologyHints: data.typologyHints, interpret: { status: "done", result: data, error: null, cached } });
    } catch (e) {
      set({ interpret: fail(e) });
    }
  },

  generateDirections: async () => {
    const scene = useSiteStore.getState().scene;
    const constraints = effectiveConstraints();
    if (!scene || !constraints) return set({ directions: fail(new Error("Load a site first.")) });
    const { brief, priorities, typologyHints } = get();
    const req: GenerateDirectionsRequest = {
      constraints,
      parcel: { ring: scene.parcel.ring, areaM2: scene.parcel.areaM2 },
      programme: useMassingStore.getState().programme,
      priorities,
      typologyHints,
      ...(brief.trim() ? { brief } : {}),
    };
    set({ directions: { ...idle(), status: "loading" } });
    try {
      const { data, cached } = await api.generateDirections(req);
      if (useSiteStore.getState().scene !== scene) return;
      useMassingStore.getState().setCustom(data.option);
      useMassingStore.getState().setActive("custom");
      set({ directions: { status: "done", result: { warnings: data.warnings }, error: null, cached } });
    } catch (e) {
      set({ directions: fail(e) });
    }
  },

  deleteCustom: () => {
    useMassingStore.getState().deleteCustom();
    set({ directions: idle() });
  },

  extractRules: async () => {
    const scene = useSiteStore.getState().scene;
    set({ rules: { ...idle(), status: "loading" } });
    try {
      const textRefs = scene?.zoning?.textRefs;
      // the parking policy text is read too when its norm table could not be parsed (other municipalities)
      const policy = scene?.parking && scene.parking.rows.length === 0 ? scene.parking.textUrl : undefined;
      const { data, cached } = await api.extractRules({ ...(textRefs?.length ? { textRefs } : {}), ...(policy ? { policyUrl: policy } : {}) });
      if (useSiteStore.getState().scene !== scene) return;
      set({ rules: { status: "done", result: data, error: null, cached } });
    } catch (e) {
      set({ rules: fail(e) });
    }
  },
  clearRules: () => set({ rules: idle() }),
}));

function effectiveConstraints() {
  return useSiteStore.getState().effectiveConstraints();
}
