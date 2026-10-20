import { create } from "zustand";
import type { PlotData } from "./globe/plotLayer";

/** Steps of the landing flow: country, city, address; "plot" = an address is chosen and its parcel is shown. */
export type Step = "country" | "city" | "address" | "plot";

/** Globe state: idle spin, flying to the country / city, parked on it, flying back. */
export type Phase = "idle" | "toCountry" | "country" | "toCity" | "city" | "toPlot" | "plot" | "toIdle" | "backToCity" | "backToCountry";

export type SelectedCountry = { id: string; name: string; alpha2: string | null };

/** A city of the GeoNames list; `cc` is the country's ISO alpha-2 code. */
export type SelectedCity = { name: string; cc: string; lon: number; lat: number; population: number };

/** A chosen address (PDOK Locatieserver id, display name, address point). */
export type SelectedAddress = { id: string; label: string; lon: number; lat: number };

type LandingState = {
  step: Step;
  country: SelectedCountry | null;
  city: SelectedCity | null;
  address: SelectedAddress | null;
  phase: Phase;
  /** The chosen address's parcel (plot number, area), once the server has answered. */
  plot: PlotData | null;
  setPlot: (plot: PlotData) => void;
  /** The rules window to the right of the globe window is open. */
  panelOpen: boolean;
  openPanel: () => void;
  /**
   * Site model (after the rules). Its 3D copy is built hidden behind the 2D view while the rules are filled in
   * (`modelPrepared` once its first frame is drawn). "waiting" = the arrow was clicked before that; "on" = the hand-over
   * runs, from `modelStart`.
   */
  model: "off" | "waiting" | "on";
  modelPrepared: boolean;
  modelStart: number | null;
  openModel: () => void;
  modelReady: () => void;
  /** The last 0.4 s of a flight: the text starts to resolve so that it is readable exactly when the camera stops. */
  resolving: boolean;
  startResolve: () => void;
  /** The address bar starts to widen (a little before the text resolves, so that it reads in the widened bar). */
  widen: boolean;
  startWiden: () => void;
  selectCountry: (country: SelectedCountry) => void;
  selectCity: (city: SelectedCity) => void;
  selectAddress: (address: SelectedAddress) => void;
  /** The plot could not be loaded: back to the address step on the city map. */
  plotFailed: () => void;
  /** Globe transition finished. */
  settle: () => void;
  /** Logo click: back to the idle globe and the country step. */
  reset: () => void;
  /** Back arrow: one level out (plot to city, city to country, country to the idle globe). */
  back: () => void;
};

export const useLandingStore = create<LandingState>()((set, get) => ({
  step: "country",
  country: null,
  city: null,
  address: null,
  phase: "idle",
  plot: null,
  setPlot: (plot) => set((s) => (s.address?.id === plot.id ? { plot } : {})),
  panelOpen: false,
  openPanel: () => set((s) => (s.step === "plot" ? { panelOpen: true } : {})),
  model: "off",
  modelPrepared: false,
  modelStart: null,
  openModel: () =>
    set((s) => (!s.panelOpen || !s.plot || s.model !== "off" ? {} : s.modelPrepared ? { model: "on", modelStart: performance.now() } : { model: "waiting" })),
  modelReady: () => set((s) => (s.model === "waiting" ? { modelPrepared: true, model: "on", modelStart: performance.now() } : { modelPrepared: true })),
  resolving: false, widen: false,
  startResolve: () => set({ resolving: true }),
  startWiden: () => set({ widen: true }),
  selectCountry: (country) => set({ country, city: null, address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "city", phase: "toCountry", resolving: false, widen: false }),
  selectCity: (city) => set({ city, address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "address", phase: "toCity", resolving: false, widen: false }),
  selectAddress: (address) => set({ address, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "plot", phase: "toPlot", resolving: false, widen: false }),
  plotFailed: () => set({ address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "address", phase: "city", resolving: false, widen: false }),
  settle: () => {
    const { phase } = get();
    if (phase === "toCountry") set({ phase: "country", resolving: false, widen: false });
    else if (phase === "toCity") set({ phase: "city", resolving: false, widen: false });
    else if (phase === "toPlot") set({ phase: "plot", resolving: false, widen: false });
    else if (phase === "toIdle") set({ phase: "idle", resolving: false, widen: false });
    else if (phase === "backToCity") set({ phase: "city", resolving: false, widen: false });
    else if (phase === "backToCountry") set({ phase: "country", resolving: false, widen: false });
  },
  reset: () => set((s) => ({ country: null, city: null, address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "country", phase: s.country ? "toIdle" : "idle", resolving: false, widen: false })),
  back: () => {
    const { step, phase } = get();
    if (phase !== "country" && phase !== "city" && phase !== "plot") return;
    if (step === "plot") set({ address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "address", phase: "backToCity", resolving: false, widen: false });
    else if (step === "address") set({ city: null, address: null, plot: null, panelOpen: false, model: "off", modelPrepared: false, modelStart: null, step: "city", phase: "backToCountry", resolving: false, widen: false });
    else if (step === "city") get().reset();
  },
}));
