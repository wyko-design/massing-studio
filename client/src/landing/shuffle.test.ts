import { describe, expect, it, vi } from "vitest";
import { runBusy, runResolve, runShuffle, shuffleFrame, shuffleFrameCount } from "./shuffle";

const mid = () => 0.5;

describe("shuffleFrame", () => {
  it("starts with a growing band of random characters and nothing real yet", () => {
    // r = −10: the window u < r + 10 = 0 is empty, so every character is still hidden
    expect(shuffleFrame("Hello world", -10, 10, mid).join("")).toBe("     ".replace(/ /g, "") + " ".repeat(1));
    // r = −7: the first three non-space characters flicker, the rest are hidden
    const f = shuffleFrame("Hello world", -7, 10, mid);
    expect(f.slice(0, 3).every((c) => c !== "")).toBe(true);
    expect(f[3]).toBe("");
    expect(f[5]).toBe(" ");
  });

  it("leaves real letters behind a 10-character band", () => {
    const f = shuffleFrame("abcdefghijklmnopqrstuvwxyz", 5, 10, mid);
    expect(f.slice(0, 5).join("")).toBe("abcde"); // real
    expect(f.slice(5, 15).every((c) => c !== "" && c !== undefined)).toBe(true); // flickering
    expect(f.slice(15).every((c) => c === "")).toBe(true); // not shown yet
  });

  it("scrambles within the character's class and keeps spaces", () => {
    const f = shuffleFrame("aB, c", 0, 10, mid);
    expect(f[0]).toMatch(/[a-z0-9]/);
    expect(f[1]).toMatch(/[A-Z0-9]/);
    expect(f[2]).toMatch(/[^a-zA-Z\s]/); // symbol class
    expect(f[3]).toBe(" ");
  });

  it("shows the whole text at the last frame", () => {
    const text = "Where on earth?";
    const c = [...text].filter((ch) => !/\s/.test(ch)).length;
    expect(shuffleFrame(text, c, 10, mid).join("")).toBe(text);
    expect(shuffleFrameCount(text)).toBe(c + 11);
  });
});

describe("runShuffle", () => {
  it("takes the same time for short and long text", () => {
    vi.useFakeTimers();
    for (const text of ["Hi", "A much longer line of text than the other one, really"]) {
      const frames: string[] = [];
      const done = vi.fn();
      runShuffle(text, (c) => frames.push(c.join("")), done);
      vi.advanceTimersByTime(1000);
      expect(done).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(13);
      expect(frames[frames.length - 1]).toBe(text);
    }
    vi.useRealTimers();
  });

  it("plays at 30 fps and ends on the full text", () => {
    vi.useFakeTimers();
    const frames: string[] = [];
    const done = vi.fn();
    runShuffle("Hi there", (c) => frames.push(c.join("")), done);
    expect(frames).toHaveLength(1); // the first frame is immediate
    vi.advanceTimersByTime(10_000);
    expect(frames).toHaveLength(13);
    expect(done).toHaveBeenCalledTimes(1);
    expect(frames[frames.length - 1]).toBe("Hi there");
    vi.useRealTimers();
  });

  it("can be cancelled", () => {
    vi.useFakeTimers();
    const frames: string[] = [];
    const cancel = runShuffle("Hello", (c) => frames.push(c.join("")));
    vi.advanceTimersByTime(100);
    cancel();
    const n = frames.length;
    vi.advanceTimersByTime(2000);
    expect(frames).toHaveLength(n);
    vi.useRealTimers();
  });
});

describe("runBusy / runResolve", () => {
  it("busy repeats the normal sweep (same length, same rate) and never shows the real text", () => {
    vi.useFakeTimers();
    const text = "Where in Delft?";
    const frames: string[] = [];
    const cancel = runBusy(text, (c) => frames.push(c.join("")));
    vi.advanceTimersByTime(2000); // 5 sweeps of 0.4 s at 30 fps
    expect(frames.length).toBeGreaterThanOrEqual(60);
    expect(frames.length).toBeLessThanOrEqual(64);
    expect(frames.every((f) => f.length === text.length && f[5] === " " && f[8] === " ")).toBe(true);
    expect(frames.some((f) => f === text)).toBe(false);
    // it moves: a character is flickering in the band, the ones it passed hold a value until the next pass
    expect(new Set(frames).size).toBeGreaterThan(40);
    const held = frames.slice(1, 12).filter((f, i) => f.slice(-3) === frames[i]!.slice(-3));
    expect(held.length).toBeGreaterThan(0); // the end of the text (not yet reached by the band) stays put for a while
    cancel();
    const n = frames.length;
    vi.advanceTimersByTime(1000);
    expect(frames).toHaveLength(n);
    vi.useRealTimers();
  });

  it("resolve is one normal sweep, 0.4 s for any length, from the scrambled text to the real one", () => {
    vi.useFakeTimers();
    for (const text of ["Hi", "A much longer line of text than the other one, really"]) {
      const frames: string[] = [];
      const done = vi.fn();
      const rest = [...text].map((c) => (c === " " ? " " : "#"));
      runResolve(text, rest, (c) => frames.push(c.join("")), done);
      vi.advanceTimersByTime(1000);
      expect(done).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(13);
      expect(frames[frames.length - 1]).toBe(text);
      // ahead of the band the old scrambled value stays (no empty characters)
      expect(frames.every((f) => f.length === text.length)).toBe(true);
      expect(frames[0]!.endsWith("#") || text.length <= 10).toBe(true);
    }
    vi.useRealTimers();
  });
});
