import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { runBusy, runResolve, runShuffle } from "./shuffle";

export type TextPart = { text: string; className?: string };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Text that appears, and switches whenever it changes, with the shuffle effect (see shuffle.ts).
 * Parts share one effect but keep their own class (e.g. a blue word inside a label).
 *
 * The full text is laid out invisibly to give the box its final size, so the surrounding layout
 * (also centred text) does not move while the live copy, drawn on top from the left, grows.
 * `active` = false shows the final text without animating (e.g. while it is faded out).
 * `scrambling` = true keeps the whole text scrambled, every frame, for as long as it is set (the app is busy, e.g. the camera
 * is flying); when it goes false the same text resolves into the real letters.
 */
export function ShuffleText({ parts, active = true, scrambling = false }: { parts: TextPart[]; active?: boolean; scrambling?: boolean }) {
  const text = parts.map((p) => p.text).join("");
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  /** What the last run was, to resolve (instead of sweeping in) when a scramble of the same text ends. */
  const last = useRef<{ text: string; scrambling: boolean } | null>(null);
  /** The last frame of the busy loop: where the resolving sweep starts from. */
  const frame = useRef<string[]>([]);

  useLayoutEffect(() => {
    const write = (chars: string[] | null) => {
      let at = 0;
      parts.forEach((p, k) => {
        const n = [...p.text].length;
        const el = refs.current[k];
        if (el) el.textContent = chars ? chars.slice(at, at + n).join("") : p.text;
        at += n;
      });
    };
    if (!active || reducedMotion()) {
      write(null);
      return;
    }
    const before = last.current;
    last.current = { text, scrambling };
    if (scrambling) {
      const cancel = runBusy(text, (chars) => {
        frame.current = chars;
        write(chars);
      });
      return () => {
        cancel();
        write(null);
      };
    }
    // a scramble of this very text just ended: the letters take over, no new sweep from empty
    const resolve = before?.scrambling && before.text === text;
    if (!resolve) write([]);
    const cancel = resolve ? runResolve(text, frame.current, write, () => write(null)) : runShuffle(text, write, () => write(null));
    return () => {
      cancel();
      write(null);
    };
    // parts are compared by their text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active, scrambling]);

  return (
    <span className="shuffle" aria-label={text}>
      <span className="shuffle-sizer" aria-hidden>
        {parts.map((p, k) => (
          <span key={k} className={p.className}>
            {p.text}
          </span>
        ))}
      </span>
      <span className="shuffle-live" aria-hidden>
        {parts.map((p, k) => (
          <span key={k} className={p.className} ref={(el) => void (refs.current[k] = el)} />
        ))}
      </span>
    </span>
  );
}

/** A string (for an attribute such as a placeholder) that switches with the shuffle effect. */
export function useShuffledString(text: string, active = true, scrambling = false): string {
  const [shown, setShown] = useState(reducedMotion() || !active ? text : "");
  const last = useRef<{ text: string; scrambling: boolean } | null>(null);
  const frame = useRef<string[]>([]);
  useEffect(() => {
    if (!active || reducedMotion()) {
      setShown(text);
      return;
    }
    const before = last.current;
    last.current = { text, scrambling };
    const write = (chars: string[]) => setShown(chars.join(""));
    const cancel = scrambling
      ? runBusy(text, (chars) => {
          frame.current = chars;
          write(chars);
        })
      : before?.scrambling && before.text === text
        ? runResolve(text, frame.current, write, () => setShown(text))
        : runShuffle(text, write, () => setShown(text));
    return () => {
      cancel();
      setShown(text);
    };
  }, [text, active, scrambling]);
  return shown;
}
