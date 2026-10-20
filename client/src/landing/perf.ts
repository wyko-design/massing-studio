import { useLandingStore } from "./landingStore";

/**
 * Performance probes for the landing flow, on only with `?perf` in the URL (any build). Off, every probe is a plain call:
 * no timers, no observers, no allocations.
 *
 * Collected per phase (landing phase + the globe's running stage): canvas draw times, named heavy calls and main-thread
 * long tasks (> 50 ms, PerformanceObserver). Long tasks are CPU time, so they stay meaningful when the tab is throttled.
 * Read them in the console with `__perf.summary()`; `__perf.reset()` clears.
 */
export const perfOn = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf");

type Sample = { name: string; ms: number; phase: string; at: number };

const MAX = 20000;
const calls: Sample[] = [];
const draws: Sample[] = [];
const longTasks: Sample[] = [];
let stage = "";
/** Phase changes over time, so a long task (reported after it ends) is filed under the phase it started in. */
const timeline: { at: number; phase: string }[] = [];

function note(phase: string, at: number) {
  if (timeline[timeline.length - 1]?.phase === phase) return;
  if (timeline.length >= MAX) timeline.shift();
  timeline.push({ at, phase });
}

function phaseAt(at: number): string {
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i]!.at <= at) return timeline[i]!.phase;
  return perfPhase();
}

/** The globe's running stage ("pan", "zoom", …); empty when parked. */
export function perfStage(name: string) {
  if (!perfOn) return;
  stage = name;
  note(perfPhase(), performance.now());
}

export function perfPhase(): string {
  const s = useLandingStore.getState();
  const base = s.model !== "off" ? `model:${s.model}` : s.panelOpen ? "rules" : s.phase;
  return stage ? `${base}/${stage}` : base;
}

function push(list: Sample[], name: string, ms: number) {
  if (list.length >= MAX) list.shift();
  const phase = perfPhase();
  const at = performance.now();
  note(phase, at - ms);
  list.push({ name, ms, phase, at });
}

/** Runs `fn`, timing it under `name` when probes are on. */
export function timed<T>(name: string, fn: () => T): T {
  if (!perfOn) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    push(calls, name, performance.now() - t0);
  }
}

/** Lap timer for the parts of one draw: each call records the time since the previous one as `<prefix>:<name>`. */
export function perfLaps(prefix: string): (name: string) => void {
  if (!perfOn) return () => undefined;
  let t = performance.now();
  return (name) => {
    const now = performance.now();
    push(draws, `${prefix}:${name}`, now - t);
    t = now;
  };
}

/** Records a duration measured elsewhere (e.g. a worker job) as a named call. */
export function perfCall(name: string, ms: number) {
  if (perfOn) push(calls, name, ms);
}

/** Records the duration of one canvas draw. */
export function perfDraw(name: string, ms: number) {
  if (perfOn) push(draws, name, ms);
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function perfSummary() {
  const phases = new Map<string, { draws: number[]; long: number[] }>();
  const of = (p: string) => phases.get(p) ?? (phases.set(p, { draws: [], long: [] }), phases.get(p)!);
  for (const d of draws) if (d.name === "globe") of(d.phase).draws.push(d.ms);
  for (const l of longTasks) of(l.phase).long.push(l.ms);
  const byPhase = [...phases].map(([phase, { draws: d, long: l }]) => ({
    phase,
    frames: d.length,
    drawP50: r1(pct(d, 0.5)),
    drawP95: r1(pct(d, 0.95)),
    drawMax: r1(Math.max(0, ...d)),
    longTasks: l.length,
    longTotal: Math.round(l.reduce((a, b) => a + b, 0)),
    longMax: Math.round(Math.max(0, ...l)),
  }));
  const names = new Map<string, number[]>();
  for (const c of calls) (names.get(`${c.name} @ ${c.phase}`) ?? (names.set(`${c.name} @ ${c.phase}`, []), names.get(`${c.name} @ ${c.phase}`)!)).push(c.ms);
  const byCall = [...names]
    .map(([name, ms]) => ({ name, count: ms.length, total: r1(ms.reduce((a, b) => a + b, 0)), max: r1(Math.max(...ms)) }))
    .sort((a, b) => b.total - a.total);
  const parts = new Map<string, number[]>();
  for (const d of draws) if (d.name !== "globe") (parts.get(`${d.name} @ ${d.phase}`) ?? (parts.set(`${d.name} @ ${d.phase}`, []), parts.get(`${d.name} @ ${d.phase}`)!)).push(d.ms);
  const bySection = [...parts].map(([name, ms]) => ({ name, p50: r1(pct(ms, 0.5)), p95: r1(pct(ms, 0.95)), max: r1(Math.max(...ms)) })).sort((a, b) => b.p95 - a.p95);
  return { byPhase, bySection, byCall, longTasks: longTasks.map((l) => ({ phase: l.phase, ms: Math.round(l.ms), at: Math.round(l.at) })) };
}

export function perfReset() {
  calls.length = 0;
  draws.length = 0;
  longTasks.length = 0;
  timeline.length = 0;
}

/** Recent numbers for the overlay: draw p95 over the last 2 s, long tasks over the last 10 s. */
export function perfRecent() {
  const now = performance.now();
  const d = draws.filter((x) => x.name === "globe" && now - x.at < 2000).map((x) => x.ms);
  const l = longTasks.filter((x) => now - x.at < 10000);
  return { phase: perfPhase(), drawP95: r1(pct(d, 0.95)), frames: d.length, long: l.length, longMax: Math.round(Math.max(0, ...l.map((x) => x.ms))) };
}

if (perfOn) {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (longTasks.length >= MAX) longTasks.shift();
        longTasks.push({ name: "longtask", ms: e.duration, phase: phaseAt(e.startTime), at: e.startTime });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // no long task API (not Chrome): draw and call timings still work
  }
  // the store's phase changes are noted too: a long task right after a click belongs to the new phase
  useLandingStore.subscribe(() => note(perfPhase(), performance.now()));
  (window as unknown as { __perf?: unknown }).__perf ={ summary: perfSummary, reset: perfReset, recent: perfRecent };
}
