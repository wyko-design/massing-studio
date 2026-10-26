import { modelStyle } from "./modelStyle";

/**
 * A view of the site model: the turn about the vertical (`azimuth`, radians; the camera looks along (sin φ, 0, −cos φ),
 * so 45° looks north-east from the south-west), the tilt from straight down (`polar`, radians), the zoom relative to the
 * model's end view (1 = the landing's view), and the ground point it looks at (world x, z in model metres).
 */
export type SiteView = { azimuth: number; polar: number; zoom: number; target: [number, number] };

/** A capture: a square image of `size` px, as PNG or JPEG. */
export type CaptureRequest = { size: number; mime: "image/png" | "image/jpeg" };

/** The live site model's camera and renderer, while it can be turned (registered by the model, null otherwise). */
export type SiteViewHandle = {
  get: () => SiteView;
  set: (view: SiteView) => void;
  /** The square drawn at `size` × `size` px from the view on screen, with the wash and the label layer, encoded. */
  capture: (request: CaptureRequest) => Promise<Blob>;
};

let current: SiteViewHandle | null = null;
export const registerSiteView = (h: SiteViewHandle | null) => {
  current = h;
};
export const siteView = () => current;

const RAD = Math.PI / 180;

/** The landing's end view: true isometric from the south-west, the plot in the middle. */
export const HOME_VIEW: SiteView = { azimuth: modelStyle.camera.azimuthDeg * RAD, polar: modelStyle.camera.polarDeg * RAD, zoom: 1, target: [0, 0] };

export const VIEW_PRESETS = { sw: "SW", se: "SE", ne: "NE", nw: "NW", top: "Top" } as const;
export type ViewPreset = keyof typeof VIEW_PRESETS;

/** Compass bearing the camera looks from, per corner. */
const FROM: Record<Exclude<ViewPreset, "top">, number> = { ne: 45, se: 135, sw: 225, nw: 315 };

/** A preset at the end view's zoom: isometric from a corner, or straight down with north up. */
export function presetView(preset: ViewPreset): SiteView {
  if (preset === "top") return { azimuth: 0, polar: 0.001, zoom: 1, target: [0, 0] };
  return { ...HOME_VIEW, azimuth: ((FROM[preset] + 180) % 360) * RAD };
}

const SAVED_KEY = "massing.siteViews";

/** One saved view per plot, in this browser only. Storage may be unavailable: never required. */
export function loadSavedViews(): Record<string, SiteView> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as Record<string, SiteView>;
  } catch {
    return {};
  }
}

export function storeSavedViews(views: Record<string, SiteView>) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(views));
  } catch {
    // not persisted; the view still lives in memory
  }
}
