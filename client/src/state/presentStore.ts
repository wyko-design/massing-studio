import { create } from "zustand";
import { useMassingStore, type OptionId } from "./massingStore";
import { defaultRenderStyle, type LookId, type RenderStyle } from "../viewer/renderStyle";
import { loadSavedViews, presetView, siteView, storeSavedViews, type SiteView, type ViewPreset } from "../landing/model/siteView";
import type { Multiplier } from "../present/frame";

const LOOK_KEY = "massing.siteLook";

/** The lighting look this browser last chose (the site model's "lines" or "sun"). */
function savedLook(): LookId {
  try {
    const look = localStorage.getItem(LOOK_KEY);
    return look === "sun" ? "sun" : "lines";
  } catch {
    return "lines";
  }
}

/** `report` jobs hand their JPEG back to `renderForReport` instead of downloading a PNG. */
export type ExportJob = { id: number; multiplier: Multiplier; fileName: string; option: OptionId; deliver: "download" | "report" };
export type ExportState =
  | { status: "idle" }
  | { status: "rendering" }
  | { status: "done"; url: string; fileName: string; width: number; height: number; bytes: number; ms: number; blob: Blob }
  | { status: "error"; message: string };

type PresentState = {
  /** The look (lines or sun) and the label style; the rest of the render style is the site model's own. */
  style: RenderStyle;
  multiplier: Multiplier;
  streetLabels: boolean;
  annotations: boolean;
  /** One saved view per parcel id. */
  savedViews: Record<string, SiteView>;
  job: ExportJob | null;
  exportState: ExportState;
  setLook: (look: LookId) => void;
  applyPreset: (preset: ViewPreset) => void;
  setMultiplier: (multiplier: Multiplier) => void;
  setToggle: (key: "streetLabels" | "annotations", on: boolean) => void;
  saveView: (parcelId: string) => void;
  restoreView: (parcelId: string) => void;
  startExport: (fileName: string) => void;
  /** Render one option from the view on screen for the PDF report; resolves with the JPEG. One at a time. */
  renderForReport: (option: OptionId, multiplier: Multiplier) => Promise<Blob>;
  finishExport: (result: ExportState) => void;
};

let jobId = 0;
const reportWaiters = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

export const usePresentStore = create<PresentState>()((set, get) => ({
  style: { ...defaultRenderStyle, look: savedLook() },
  multiplier: 2,
  streetLabels: true,
  annotations: true,
  savedViews: loadSavedViews(),
  job: null,
  exportState: { status: "idle" },
  setLook: (look) => {
    try {
      localStorage.setItem(LOOK_KEY, look);
    } catch {
      // private window: the choice just is not remembered
    }
    set((s) => ({ style: { ...s.style, look } }));
  },
  applyPreset: (preset) => siteView()?.set(presetView(preset)),
  setMultiplier: (multiplier) => set({ multiplier }),
  setToggle: (key, on) => set({ [key]: on } as Pick<PresentState, typeof key>),
  saveView: (parcelId) => {
    const view = siteView()?.get();
    if (!view) return;
    const savedViews = { ...get().savedViews, [parcelId]: view };
    storeSavedViews(savedViews);
    set({ savedViews });
  },
  restoreView: (parcelId) => {
    const view = get().savedViews[parcelId];
    if (view) siteView()?.set(view);
  },
  startExport: (fileName) => {
    if (!siteView()) return set({ exportState: { status: "error", message: "The model is not ready yet." } });
    const prev = get().exportState;
    if (prev.status === "done") URL.revokeObjectURL(prev.url);
    set({ job: { id: ++jobId, multiplier: get().multiplier, fileName, option: useMassingStore.getState().active, deliver: "download" }, exportState: { status: "rendering" } });
  },
  renderForReport: (option, multiplier) =>
    new Promise<Blob>((resolve, reject) => {
      const id = ++jobId;
      reportWaiters.set(id, { resolve, reject });
      set({ job: { id, multiplier, fileName: `report-${option}.jpg`, option, deliver: "report" } });
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
      } else waiter.reject(new Error(exportState.status === "error" ? exportState.message : "Render failed."));
      return;
    }
    set({ job: null, exportState });
  },
}));
