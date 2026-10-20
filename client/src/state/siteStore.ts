import { useMemo } from "react";
import { create } from "zustand";
import {
  NO_EXTRACTED,
  applyExtracted,
  applyOverrides,
  applyParking,
  parkingNormFrom,
  type ParkingNorm,
  type ParkingPolicy,
  isPlaceholder,
  resolveEnvelope,
  type Envelope,
  type Extracted,
  type FieldPath,
  type Overrides,
  type SiteConstraints,
  type SiteScene,
} from "@massing/shared";
import { fetchScene } from "../api/scene";
// Circular on purpose: the parking norm depends on the programme's unit size, read at call time (never while modules load).
import { useMassingStore } from "./massingStore";

type SiteState = {
  scene: SiteScene | null;
  loading: boolean;
  error: string | null;
  /** Contents of the address input. */
  address: string;
  /** User overrides of constraint values, per field. Cleared when another parcel loads. */
  overrides: Overrides;
  /** Overridden paths holding stand-in values (not the user's own): they count as inputted but stay `assumed`. */
  placeholders: FieldPath[];
  /** Rules accepted from the constraint interpreter (status extracted, with quotes). Under the overrides. */
  extracted: Extracted;
  /** Parking zone picked by the user; null = use the guess from the plan areas. Cleared when another parcel loads. */
  parkingZone: string | null;
  showEnvelope: boolean;
  setAddress: (address: string) => void;
  load: (query?: string) => Promise<void>;
  setOverride: (path: FieldPath, value: unknown) => void;
  /** Fills these paths with stand-in values (status assumed). */
  fillPlaceholders: (values: Overrides) => void;
  clearOverride: (path: FieldPath) => void;
  setExtracted: (extracted: Extracted) => void;
  setParkingZone: (zone: string | null) => void;
  /** Constraints with extracted values and overrides applied; for non-React callers. */
  effectiveConstraints: () => SiteConstraints | null;
  setShowEnvelope: (show: boolean) => void;
};

export const useSiteStore = create<SiteState>()((set, get) => ({
  scene: null,
  loading: false,
  error: null,
  address: "",
  overrides: {},
  placeholders: [],
  extracted: NO_EXTRACTED,
  parkingZone: null,
  showEnvelope: true,
  setAddress: (address) => set({ address }),
  load: async (query) => {
    set({ loading: true, error: null });
    try {
      const scene = await fetchScene(query);
      const sameParcel = get().scene?.parcel.id === scene.parcel.id;
      set({
        scene,
        address: scene.meta?.address ?? query ?? "",
        loading: false,
        ...(sameParcel ? {} : { overrides: {}, placeholders: [], extracted: NO_EXTRACTED, parkingZone: null }),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
  setOverride: (path, value) => set((s) => ({ overrides: { ...s.overrides, [path]: value }, placeholders: s.placeholders.filter((p) => p !== path) })),
  fillPlaceholders: (values) =>
    set((s) => ({
      overrides: { ...s.overrides, ...values },
      placeholders: [...s.placeholders.filter((p) => !(p in values)), ...(Object.keys(values) as FieldPath[])],
    })),
  clearOverride: (path) =>
    set((s) => {
      const { [path]: _, ...rest } = s.overrides;
      return { overrides: rest, placeholders: s.placeholders.filter((p) => p !== path) };
    }),
  setExtracted: (extracted) => set({ extracted }),
  setParkingZone: (parkingZone) => set({ parkingZone }),
  effectiveConstraints: () => {
    const { scene, extracted, overrides, placeholders, parkingZone } = get();
    const base = scene?.zoning?.constraints;
    if (!base) return null;
    const zone = activeZone(scene?.parking, parkingZone);
    const unit = useMassingStore.getState().programme.avgUnitSize;
    return applyOverrides(applyParking(applyExtracted(base, extracted), scene?.parking, zone, parkingZone !== null, unit), overrides, placeholders);
  },
  setShowEnvelope: (showEnvelope) => set({ showEnvelope }),
}));

/** The zone in use: the user's pick, else the guess from the plan areas. */
export function activeZone(policy: ParkingPolicy | undefined, picked: string | null): string | null {
  return picked ?? policy?.suggestedZone?.id ?? null;
}

/** Constraints with accepted extracted rules, the municipal parking norm and the user's overrides applied (local frame). */
export function useConstraints(): SiteConstraints | null {
  const base = useSiteStore((s) => s.scene?.zoning?.constraints);
  const policy = useSiteStore((s) => s.scene?.parking);
  const extracted = useSiteStore((s) => s.extracted);
  const overrides = useSiteStore((s) => s.overrides);
  const placeholders = useSiteStore((s) => s.placeholders);
  const picked = useSiteStore((s) => s.parkingZone);
  const unit = useMassingStore((s) => s.programme.avgUnitSize);
  return useMemo(
    () => (base ? applyOverrides(applyParking(applyExtracted(base, extracted), policy, activeZone(policy, picked), picked !== null, unit), overrides, placeholders) : null),
    [base, policy, extracted, overrides, placeholders, picked, unit],
  );
}

/** The parking norm the policy gives for the chosen zone and the programme's unit size (for the Constraints screen). */
export function useParkingNorm(): { policy: ParkingPolicy; zoneId: string | null; chosen: boolean; norm: ParkingNorm | null; unitM2: number } | null {
  const policy = useSiteStore((s) => s.scene?.parking);
  const picked = useSiteStore((s) => s.parkingZone);
  const unitM2 = useMassingStore((s) => s.programme.avgUnitSize);
  if (!policy) return null;
  const zoneId = activeZone(policy, picked);
  return { policy, zoneId, chosen: picked !== null, norm: zoneId ? parkingNormFrom(policy, zoneId, unitM2) : null, unitM2 };
}

/** Buildable envelope from the effective constraints. Recomputed on every override, no server call. */
export function useEnvelope(): Envelope | null {
  const ring = useSiteStore((s) => s.scene?.parcel.ring);
  const constraints = useConstraints();
  return useMemo(() => (ring && constraints ? resolveEnvelope(ring, constraints) : null), [ring, constraints]);
}

/** True while any constraint or the envelope is `assumed`. Drives the badge now and the export watermark (P9). */
export function usePlaceholder(): boolean {
  const constraints = useConstraints();
  const envelope = useEnvelope();
  return constraints ? isPlaceholder(constraints, envelope ?? undefined) : true;
}
