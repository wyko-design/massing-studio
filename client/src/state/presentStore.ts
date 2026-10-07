import { create } from "zustand";
import { useMassingStore, type OptionId } from "./massingStore";
import { defaultRenderStyle, type RenderStyle } from "../viewer/renderStyle";
import { cameraHandle } from "../viewer/cameraHandle";
import { convertView, presetView, type Focus, type Preset, type Projection, type View } from "../present/camera";
import type { Aspect, Multiplier } from "../present/frame";

const SAVED_VIEWS_KEY = "massing.savedViews";

/** Saved views survive a reload in this browser only. Storage may be unavailable: never required. */
function loadSavedViews(): Record<string, View> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? "{}") as Record<string, View>;
  } catch {
    return {};
  }
}
function storeSavedViews(views: Record<string, View>) {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // not persisted; the view still lives in memory
  }
}

/** `report` jobs hand their JPEG back to `renderForReport` instead of downloading a PNG. */
export type ExportJob = { id: number; view: View; aspect: Aspect; multiplier: Multiplier; fileName: string; option: OptionId; deliver: "download" | "report" };
export type ExportState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "done"; url: string; fileName: string; width: number; height: number; bytes: number; ms: number; blob: Blob }
  | { status: "error"; message: string };

type PresentState = {
  style: RenderStyle;
  projection: Projection;
  aspect: Aspect;
  multiplier: Multiplier;
  streetLabels: boolean;
  annotations: boolean;
  /** One saved custom camera per parcel id. */
  savedViews: Record<string, View>;
  job: ExportJob | null;
  exportState: ExportState;
  setStyle: <K extends keyof RenderStyle>(key: K, patch: Partial<RenderStyle[K]>) => void;
  setProjectionState: (projection: Projection) => void;
  /** Switch projection keeping the framing. */
  switchProjection: (projection: Projection) => void;
  applyPreset: (preset: Preset, focus: Focus, streetBearing: number | null) => void;
  setAspect: (aspect: Aspect) => void;
  setMultiplier: (multiplier: Multiplier) => void;
  setToggle: (key: "streetLabels" | "annotations", on: boolean) => void;
  saveView: (parcelId: string) => void;
  restoreView: (parcelId: string) => void;
  startExport: (fileName: string) => void;
  /** Render one option from a given view for the PDF report; resolves with the JPEG. One at a time. */
  renderForReport: (option: OptionId, view: View, aspect: Aspect, multiplier: Multiplier) => Promise<Blob>;
  finishExport: (result: ExportState) => void;
};

let jobId = 0;
const reportWaiters = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

export const usePresentStore = create<PresentState>()((set, get) => ({
  style: defaultRenderStyle,
  projection: "ortho",
  aspect: "4:5",
  multiplier: 2,
  streetLabels: true,
  annotations: true,
  savedViews: loadSavedViews(),
  job: null,
  exportState: { status: "idle" },
  setStyle: (key, patch) => set((s) => ({ style: { ...s.style, [key]: { ...(s.style[key] as object), ...patch } } })),
  setProjectionState: (projection) => set({ projection }),
  switchProjection: (projection) => {
    const h = cameraHandle();
    if (h) h.apply(convertView(h.capture(), projection, h.size()));
  },
  applyPreset: (preset, focus, streetBearing) => {
    const h = cameraHandle();
    if (h) h.apply(presetView(preset, focus, h.size(), get().projection, streetBearing));
  },
  setAspect: (aspect) => set({ aspect }),
  setMultiplier: (multiplier) => set({ multiplier }),
  setToggle: (key, on) => set({ [key]: on } as Pick<PresentState, typeof key>),
  saveView: (parcelId) => {
    const view = cameraHandle()?.capture();
    if (!view) return;
    const savedViews = { ...get().savedViews, [parcelId]: view };
    storeSavedViews(savedViews);
    set({ savedViews });
  },
  restoreView: (parcelId) => {
    const view = get().savedViews[parcelId];
    if (view) cameraHandle()?.apply(view);
  },
  startExport: (fileName) => {
    const view = cameraHandle()?.capture();
    if (!view) return set({ exportState: { status: "error", message: "The viewer is not ready yet." } });
    const prev = get().exportState;
    if (prev.status === "done") URL.revokeObjectURL(prev.url);
    const { aspect, multiplier } = get();
    set({ job: { id: ++jobId, view, aspect, multiplier, fileName, option: useMassingStore.getState().active, deliver: "download" }, exportState: { status: "rendering" } });
  },
  renderForReport: (option, view, aspect, multiplier) =>
    new Promise<Blob>((resolve, reject) => {
      const id = ++jobId;
      reportWaiters.set(id, { resolve, reject });
      set({ job: { id, view, aspect, multiplier, fileName: `report-${option}.jpg`, option, deliver: "report" } });
    }),
  finishExport: (exportState) => {
    const job = get().job;
    const waiter = job?.deliver === "report" ? reportWaiters.get(job.id) : undefined;
    if (job && waiter) {
      reportWaiters.delete(job.id);
      set({ job: null });
      if (exportState.status === "done") {
        URL.revokeObjectURL(exportState.url);
        waiter.resolve(exportState.blob);
      }
      else waiter.reject(new Error(exportState.status === "error" ? exportState.message : "Render failed."));
      return;
    }
    set({ job: null, exportState });
  },
}));
