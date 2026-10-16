/**
 * The text "shuffle" effect of 2022.rauno.me (its `data-shuffle` elements), reconstructed from the
 * site's own code:
 *
 * - The text is split into characters; spaces stay where they are, every other character is
 *   classed as lower case (a–z), upper case (A–Z) or symbol (everything else, digits included).
 * - A counter r runs from −iterations up to the number of non-space characters c, one step per
 *   frame (30 fps).
 * - In each frame, the first max(r, 0) non-space characters show their real letter; the next
 *   `iterations` characters show a random character of their own class (lower case → a–z0–9,
 *   upper case → A–Z0–9, symbol → punctuation); everything after that is still empty.
 *
 * So a band of 10 flickering characters sweeps from the left through the text and leaves the real
 * letters behind it, and the text grows to its full length as it goes.
 */

export type ShuffleOptions = { iterations?: number; fps?: number; durationMs?: number };

/** `durationMs` is the same for every text: the counter's step per frame scales with the text's length. */
export const SHUFFLE_DEFAULTS: { iterations: number; fps: number; durationMs: number } = { iterations: 10, fps: 30, durationMs: 400 };

const POOLS = {
  lowerCase: "abcdefghijklmnopqrstuvwxyz0123456789",
  upperCase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  symbol: ",.?/\\(^)![]{}*&^%$#'\"",
} as const;

type CharClass = "space" | keyof typeof POOLS;

const classOf = (c: string): CharClass => (/\s/.test(c) ? "space" : /[a-z]/.test(c) ? "lowerCase" : /[A-Z]/.test(c) ? "upperCase" : "symbol");

/** Indices (into the characters of `text`) of its non-space characters. */
function movable(chars: string[]): number[] {
  const out: number[] = [];
  chars.forEach((c, i) => {
    if (classOf(c) !== "space") out.push(i);
  });
  return out;
}

/** Number of frames of a shuffle of `text` (r from −iterations to c inclusive). */
export function shuffleFrameCount(text: string, iterations = SHUFFLE_DEFAULTS.iterations): number {
  return movable([...text]).length + iterations + 1;
}

/**
 * One frame of the effect, one entry per character of `text` ("" = not shown yet).
 * `r` runs from −iterations to the number of non-space characters.
 */
export function shuffleFrame(
  text: string,
  r: number,
  iterations = SHUFFLE_DEFAULTS.iterations,
  rand: () => number = Math.random,
  /** What the characters the band has passed show instead of the real ones (the "busy" loop). */
  behind?: string[],
  /** What the characters the band has not reached yet show instead of nothing. */
  rest?: string[],
): string[] {
  const chars = [...text];
  const idx = movable(chars);
  const out = chars.slice();
  if (behind) for (let u = 0; u < Math.min(Math.max(r, 0), idx.length); u++) out[idx[u]!] = behind[idx[u]!] ?? out[idx[u]!]!;
  for (let u = Math.max(r, 0); u < idx.length; u++) {
    const i = idx[u]!;
    if (u < r + iterations) {
      const pool = POOLS[classOf(chars[i]!) as keyof typeof POOLS];
      out[i] = pool[Math.floor(rand() * pool.length)]!;
    } else {
      out[i] = rest?.[i] ?? "";
    }
  }
  return out;
}

/** The text with every non-space character replaced by a random one of its own class. */
export function scrambled(text: string, rand: () => number = Math.random): string[] {
  return [...text].map((c) => {
    const k = classOf(c);
    return k === "space" ? c : POOLS[k][Math.floor(rand() * POOLS[k].length)]!;
  });
}


/**
 * Plays the effect over a fixed `durationMs` whatever the length of the text: the counter r still runs from
 * −iterations to the number of non-space characters, but in a fixed number of frames (so long text sweeps in
 * bigger steps). Calls `onFrame` with each frame's characters, the first immediately, then every 1000 / fps ms,
 * and `onComplete` after the last (the full text). Returns a cancel function.
 */
export function runShuffle(
  text: string,
  onFrame: (chars: string[]) => void,
  onComplete?: () => void,
  { iterations = SHUFFLE_DEFAULTS.iterations, fps = SHUFFLE_DEFAULTS.fps, durationMs = SHUFFLE_DEFAULTS.durationMs }: ShuffleOptions = {},
): () => void {
  const last = movable([...text]).length; // r runs up to the number of non-space characters
  const frames = Math.max(2, Math.round((durationMs * fps) / 1000) + 1);
  let k = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    if (k >= frames) {
      timer = null;
      onComplete?.();
      return;
    }
    const r = Math.round(-iterations + ((last + iterations) * k) / (frames - 1));
    onFrame(shuffleFrame(text, r, iterations));
    k += 1;
    timer = setTimeout(step, 1000 / fps);
  };
  step();
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}


/**
 * The same sweep as `runShuffle` (a band of `iterations` flickering characters crossing the text in `durationMs`, 30 fps,
 * whatever the length), repeated for as long as it runs, but it never shows the real text: the characters the band has
 * passed keep a random value of their own (held until the next pass), so the text is always unreadable and always moving.
 * `onFrame` gets every frame; cancel to hand over to `runResolve`.
 */
export function runBusy(
  text: string,
  onFrame: (chars: string[]) => void,
  { iterations = SHUFFLE_DEFAULTS.iterations, fps = SHUFFLE_DEFAULTS.fps, durationMs = SHUFFLE_DEFAULTS.durationMs }: ShuffleOptions = {},
): () => void {
  const last = movable([...text]).length;
  const frames = Math.max(2, Math.round((durationMs * fps) / 1000) + 1);
  let before = scrambled(text);
  let after = scrambled(text);
  let k = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    const r = Math.round(-iterations + ((last + iterations) * k) / (frames - 1));
    onFrame(shuffleFrame(text, r, iterations, Math.random, after, before));
    if (++k >= frames) {
      k = 0;
      before = after;
      after = scrambled(text);
    }
    timer = setTimeout(step, 1000 / fps);
  };
  step();
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

/**
 * The end of the busy loop: one normal sweep (as `runShuffle`) that turns the scrambled text, as it stood when the loop
 * stopped (`rest`), into the real one: the real letters appear behind the band, the characters ahead keep their value.
 */
export function runResolve(
  text: string,
  rest: string[],
  onFrame: (chars: string[]) => void,
  onComplete?: () => void,
  { iterations = SHUFFLE_DEFAULTS.iterations, fps = SHUFFLE_DEFAULTS.fps, durationMs = SHUFFLE_DEFAULTS.durationMs }: ShuffleOptions = {},
): () => void {
  const last = movable([...text]).length;
  const frames = Math.max(2, Math.round((durationMs * fps) / 1000) + 1);
  let k = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const step = () => {
    if (k >= frames) {
      timer = null;
      onComplete?.();
      return;
    }
    const r = Math.round(-iterations + ((last + iterations) * k) / (frames - 1));
    onFrame(shuffleFrame(text, r, iterations, Math.random, undefined, rest));
    k += 1;
    timer = setTimeout(step, 1000 / fps);
  };
  step();
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
