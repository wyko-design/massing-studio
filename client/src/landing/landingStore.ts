import { create } from "zustand";

/** Steps of the landing flow: country, city, address; "plot" = an address is chosen and its parcel is shown. */
export type Step = "country" | "city" | "address" | "plot";

/** Globe state: idle spin, flying to the country / city, parked on it, flying back. */
export type Phase = "idle" | "toCountry" | "country" | "toCity" | "city" | "toPlot" | "plot" | "toIdle";

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
  /** The last 0.4 s of a flight: the text starts to resolve so that it is readable exactly when the camera stops. */
  resolving: boolean;
  startResolve: () => void;
  selectCountry: (country: SelectedCountry) => void;
  selectCity: (city: SelectedCity) => void;
  selectAddress: (address: SelectedAddress) => void;
  /** The plot could not be loaded: back to the address step on the city map. */
  plotFailed: () => void;
  /** Globe transition finished. */
  settle: () => void;
  /** Logo click: back to the idle globe and the country step. */
  reset: () => void;
};

export const useLandingStore = create<LandingState>()((set, get) => ({
  step: "country",
  country: null,
  city: null,
  address: null,
  phase: "idle",
  resolving: false,
  startResolve: () => set({ resolving: true }),
  selectCountry: (country) => set({ country, city: null, address: null, step: "city", phase: "toCountry", resolving: false }),
  selectCity: (city) => set({ city, address: null, step: "address", phase: "toCity", resolving: false }),
  selectAddress: (address) => set({ address, step: "plot", phase: "toPlot", resolving: false }),
  plotFailed: () => set({ address: null, step: "address", phase: "city", resolving: false }),
  settle: () => {
    const { phase } = get();
    if (phase === "toCountry") set({ phase: "country", resolving: false });
    else if (phase === "toCity") set({ phase: "city", resolving: false });
    else if (phase === "toPlot") set({ phase: "plot", resolving: false });
    else if (phase === "toIdle") set({ phase: "idle", resolving: false });
  },
  reset: () => set((s) => ({ country: null, city: null, address: null, step: "country", phase: s.country ? "toIdle" : "idle", resolving: false })),
}));
