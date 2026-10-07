import { useMemo } from "react";
import { create } from "zustand";
import {
  NO_EXTRACTED,
  applyExtracted,
  applyOverrides,
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

type SiteState = {
  scene: SiteScene | null;
  loading: boolean;
  error: string | null;
  /** Contents of the address input. */
  address: string;
  /** User overrides of constraint values, per field. Cleared when another parcel loads. */
  overrides: Overrides;
  /** Rules accepted from the constraint interpreter (status extracted, with quotes). Under the overrides. */
  extracted: Extracted;
  showEnvelope: boolean;
  setAddress: (address: string) => void;
  load: (query?: string) => Promise<void>;
  setOverride: (path: FieldPath, value: unknown) => void;
  clearOverride: (path: FieldPath) => void;
  setExtracted: (extracted: Extracted) => void;
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
  extracted: NO_EXTRACTED,
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
        ...(sameParcel ? {} : { overrides: {}, extracted: NO_EXTRACTED }),
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
  setOverride: (path, value) => set((s) => ({ overrides: { ...s.overrides, [path]: value } })),
  clearOverride: (path) =>
    set((s) => {
      const { [path]: _, ...rest } = s.overrides;
      return { overrides: rest };
    }),
  setExtracted: (extracted) => set({ extracted }),
  effectiveConstraints: () => {
    const { scene, extracted, overrides } = get();
    const base = scene?.zoning?.constraints;
    return base ? applyOverrides(applyExtracted(base, extracted), overrides) : null;
  },
  setShowEnvelope: (showEnvelope) => set({ showEnvelope }),
}));

/** Constraints with accepted extracted rules and the user's overrides applied (local frame). */
export function useConstraints(): SiteConstraints | null {
  const base = useSiteStore((s) => s.scene?.zoning?.constraints);
  const extracted = useSiteStore((s) => s.extracted);
  const overrides = useSiteStore((s) => s.overrides);
  return useMemo(() => (base ? applyOverrides(applyExtracted(base, extracted), overrides) : null), [base, extracted, overrides]);
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
