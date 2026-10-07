/**
 * Design frames for presentation and export. Each aspect ratio has a fixed base size in CSS px:
 * in Present mode the viewer is laid out at exactly that size and scaled to fit the window, and an
 * export renders the same size at `dpr = multiplier`. Pixel-defined sizes (outline width, label
 * text) therefore keep their relation to the frame on screen and in every export.
 */
export const ASPECTS = {
  "4:5": { label: "4:5 portrait", width: 960, height: 1200 },
  "1:1": { label: "1:1 square", width: 1080, height: 1080 },
  a3: { label: "A3 landscape", width: 1414, height: 1000 },
} as const;
export type Aspect = keyof typeof ASPECTS;

export const MULTIPLIERS = [1, 2, 4] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export type FrameSize = { width: number; height: number };

/** Pixel size of an export. */
export function exportSize(aspect: Aspect, multiplier: Multiplier): FrameSize {
  const { width, height } = ASPECTS[aspect];
  return { width: width * multiplier, height: height * multiplier };
}

/**
 * Scale and position that fit a frame centred in an available area (CSS px), never larger than
 * `maxScale`. `left`/`top` are offsets inside the area.
 */
export function fitFrame(availWidth: number, availHeight: number, frame: FrameSize, maxScale = 1.5) {
  const k = Math.max(0.05, Math.min(availWidth / frame.width, availHeight / frame.height, maxScale));
  return { k, left: (availWidth - frame.width * k) / 2, top: (availHeight - frame.height * k) / 2 };
}
