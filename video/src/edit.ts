import type { Segment } from "./Demo";
import markers from "./markers.json";
import sliderMarkers from "./markers-rec-slider.json";

/** Footage time of a step marker logged by scripts/record.mjs, plus an offset in seconds. */
const M = (name: string, offset = 0) => {
  const m = markers.find((x) => x.name === name);
  if (!m) throw new Error(`No marker ${name}`);
  return m.t + offset;
};
/** Same for the re-shot slider step (public/rec-slider.mp4: the same flow, stopped after the sliders). */
const S = (name: string, offset = 0) => sliderMarkers.find((x) => x.name === name)!.t + offset;

export const MEMBERS = ["Paweł Wykowski", "Sadraus Marco", "Wijntuin Sheldon", "Khalil Amrani"];
export const PDF_PAGES = 3;

/** Slide timings in seconds (beats line up with the motivation / reflection voiceover). */
export const SLIDES = {
  titleTail: 1.6,
  slideTail: 0.8,
  endTail: 2.5,
  motivationBeats: [0.3, 5.6, 17.2] as [number, number, number],
  reflectionLimitsAt: 8.4,
  reflectionNextAt: 26.8,
};

// Footage seconds come from src/markers.json (written by scripts/encode.mjs). Camera keys use
// footage coordinates 0–1: landing window x≈0.49; rules panel x≈0.81; Directions left panel
// x≈0.15, viewer x≈0.49, right panel x≈0.83. Waits (AI, loading) are sped up or cut.
const FULL = { x: 0.5, y: 0.5, s: 1 };
export const EDIT: Segment[] = [
  {
    id: "d1",
    vo: "d1_address",
    caption: "Address → official parcel",
    clips: [
      { from: M("d1_address"), to: M("d1_address", 19.5), rate: 2.5 }, // country, city, address typed
      { from: M("d1_address", 19.5), to: M("d1_found"), rate: 4 }, // parcel lookup and map zoom
      { from: M("d1_found"), to: M("d1_found", 2.8) },
    ],
    keys: [
      { at: 0, ...FULL },
      { at: 3, ...FULL },
      { at: 4.5, x: 0.49, y: 0.5, s: 1.4 },
      { at: 9.5, x: 0.49, y: 0.5, s: 1.4 },
      { at: 11, x: 0.49, y: 0.68, s: 2 },
    ],
  },
  {
    id: "d2",
    vo: "d2_rules",
    caption: "Zoning rules, each with its source",
    clips: [{ from: M("d1_found", 3), to: M("d3_intro", 0.55) }],
    keys: [
      { at: 0, ...FULL },
      { at: 1.5, ...FULL },
      { at: 3.5, x: 0.8, y: 0.47, s: 1.45 },
      { at: 12.5, x: 0.8, y: 0.47, s: 1.45 },
      { at: 14, x: 0.78, y: 0.6, s: 1.6 },
      { at: 17.2, x: 0.78, y: 0.6, s: 1.6 },
      { at: 18.6, ...FULL },
    ],
  },
  {
    id: "d3",
    vo: "d3_presets",
    caption: "3D site model and four preset directions",
    clips: [
      { from: M("d3_intro"), to: M("d3_presets"), rate: 1.6 }, // intro: model rises, panels grow in
      { from: M("d3_presets"), to: M("d3_presets", 2) },
      { from: M("d3_presets", 2), to: M("d3_tab_floor", -2.75), rate: 2.5 }, // click through the presets
      { from: M("d3_tab_floor", -2.75), to: M("d4_sliders", -0.06), rate: 0.75 },
    ],
    keys: [
      { at: 0, ...FULL },
      { at: 3.4, ...FULL },
      { at: 4.8, x: 0.49, y: 0.48, s: 1.7 },
      { at: 6.6, x: 0.49, y: 0.48, s: 1.7 },
      { at: 7.6, x: 0.33, y: 0.45, s: 1.35 },
      { at: 11.6, x: 0.33, y: 0.45, s: 1.35 },
      { at: 12.8, x: 0.8, y: 0.47, s: 1.55 },
    ],
  },
  {
    id: "d4",
    vo: "d4_sliders",
    caption: "Sliders: instant, no AI",
    // Coverage instead of Floors: on this preset the floors are capped by the max FAR, so the mass would not move.
    clips: [{ src: "rec-slider.mp4", from: S("d4_sliders", -0.36), to: S("d4_done", 2.3), rate: 0.9 }],
    keys: [
      { at: 0, x: 0.33, y: 0.48, s: 1.35 },
      { at: 4, x: 0.33, y: 0.48, s: 1.35 },
      { at: 5.1, x: 0.62, y: 0.48, s: 1.25 },
    ],
  },
  {
    id: "d5",
    vo: "d5_brief",
    caption: "Your brief → the AI reads it",
    clips: [
      { from: M("d5_brief", 0.2), to: M("d5_read_click", 0.7) }, // brief typed, Read brief clicked
      { from: M("d5_read_done", -0.1), to: M("d6_generate_click", -0.15) }, // AI wait cut
    ],
    keys: [
      { at: 0, x: 0.33, y: 0.45, s: 1.35 },
      { at: 1.5, x: 0.33, y: 0.45, s: 1.35 },
      { at: 2.6, x: 0.16, y: 0.42, s: 1.9 },
      { at: 9.8, x: 0.16, y: 0.42, s: 1.9 },
      { at: 11, x: 0.16, y: 0.55, s: 1.8 },
    ],
  },
  {
    id: "d6",
    vo: "d6_generate",
    caption: "The AI proposes a direction",
    clips: [
      { from: M("d6_generate_click", -0.25), to: M("d6_generate_click", 0.8) },
      { from: M("d6_generate_done", -0.1), to: M("d7_export", -0.17), rate: 0.97 }, // AI wait cut
    ],
    keys: [
      { at: 0, ...FULL },
      { at: 1.6, ...FULL },
      { at: 2.6, x: 0.8, y: 0.3, s: 1.8 },
      { at: 5, x: 0.8, y: 0.3, s: 1.8 },
      { at: 6, x: 0.8, y: 0.6, s: 1.6 },
    ],
  },
  {
    id: "d7",
    vo: "d7_export",
    caption: "Export: image, line drawing, PDF",
    clips: [{ from: M("d7_export", -0.07), to: M("d7_export_done", 0.86), rate: 1.6 }],
    keys: [
      { at: 0, ...FULL },
      { at: 2.6, ...FULL },
      { at: 3.6, x: 0.78, y: 0.5, s: 1.5 },
    ],
  },
  {
    id: "d8",
    vo: "d8_pdf",
    caption: "The exported PDF report",
    pdf: true,
    clips: [{ from: 0, to: 7 }],
    keys: [{ at: 0, ...FULL }],
  },
];
