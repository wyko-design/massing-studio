import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import "./landing.css";
import { CountryInput } from "./CountryInput";
import { GridLines } from "./GridLines";
import { GridToggle } from "./GridToggle";
import { Globe } from "./globe/Globe";
import type { GlobePlacement } from "./globe/GlobeRenderer";
import { LANDING_MIN_ROWS, boxStyle, landingLayout, lerpBox, lineY, modelWindow } from "./grid";
import { globeStyle } from "./globe/globeStyle";
import { plotLevel } from "./globe/plotLayer";
import { contextRadius, modelStyle } from "./model/modelStyle";
import { fetchPlotContext } from "./geoApi";
import { fetchScene } from "../api/scene";
import type { PlotData } from "./globe/plotLayer";
import { useEnvelope, useSiteStore } from "../state/siteStore";
import { useLandingStore } from "./landingStore";
import { TOKEN_VARS } from "./tokens";
import { RulesPanel } from "./RulesPanel";
import { ShuffleText } from "./ShuffleText";
import { useGrid } from "./useGrid";
import { perfOn } from "./perf";
import arrowUrl from "./assets/arrow.svg";
import { DIRECTIONS_HASH } from "../routes";
import { PerfHud } from "./PerfHud";

// the site model (three.js) loads only when it is needed; RulesPanel preloads it
const SiteModel = lazy(() => import("./model/SiteModel"));

/** Hook block: sub-line sits this far below the title's line box (Figma). */
const SUB_GAP = 8;
const TITLE_LINE = 26;

/** 0 → 1 over `ms` once `on` turns true (eased); back to 0 at once when it turns false. The map grows into the freed bottom section. */
function useExpand(on: boolean, ms = 450): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return setT(0);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const x = Math.min(1, (now - start) / ms);
      setT(x * x * (3 - 2 * x));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, ms]);
  return t;
}

/** Entry screen (UI-1): page grid, logo, window with the globe and the country step. */
export function Landing() {
  const grid = useGrid(LANDING_MIN_ROWS);
  const panelOpen = useLandingStore((s) => s.panelOpen);
  const layout = landingLayout(grid, undefined, panelOpen);
  const [overlay, setOverlay] = useState(false);
  const country = useLandingStore((s) => s.country);
  const city = useLandingStore((s) => s.city);
  const address = useLandingStore((s) => s.address);
  const plotFailed = useLandingStore((s) => s.plotFailed);
  const phase = useLandingStore((s) => s.phase);
  const settle = useLandingStore((s) => s.settle);
  const startResolve = useLandingStore((s) => s.startResolve);
  const startWiden = useLandingStore((s) => s.startWiden);
  const reset = useLandingStore((s) => s.reset);
  const setPlot = useLandingStore((s) => s.setPlot);
  const plot = useLandingStore((s) => s.plot);
  const model = useLandingStore((s) => s.model);
  const modelStart = useLandingStore((s) => s.modelStart);
  const modelReady = useLandingStore((s) => s.modelReady);
  const envelope = useEnvelope();
  const origin = useSiteStore((s) => s.scene?.origin ?? null);
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setOverlay((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // canvas = inside of the top band (inside the window border, above the divider line)
  const expand = useExpand(panelOpen);
  const placement = useMemo<GlobePlacement>(() => {
    const topBox = boxStyle(grid, layout.topBand);
    const full = boxStyle(grid, layout.window);
    const band = { ...topBox, height: topBox.height + (full.height - topBox.height) * expand };
    const globe = boxStyle(grid, layout.globe);
    const left = band.left + 1;
    const top = band.top + 1;
    const width = band.width - 2;
    const height = band.height - 2;
    const gx = globe.left - left;
    const gy = globe.top - top;
    return {
      width,
      height,
      left,
      top,
      dpr: grid.dpr,
      idle: {
        cx: gx + globe.width / 2,
        cy: gy + globe.height / 2,
        r: (globe.width - 1) / 2,
        clip: { x: gx, y: gy, w: globe.width, h: globe.height },
      },
      full: { x: 0, y: 0, w: width, h: height },
    };
  }, [grid, layout.topBand, layout.window, layout.globe, expand]);

  // site model: the 2D view stays where it was (frozen) and fades out over its 3D copy, while the window grows to a square
  // and moves to the centre; the rules window fades out
  const frozen = useRef(placement);
  if (model !== "on") frozen.current = placement;
  const shown = model === "on" ? frozen.current : placement;
  const modelT = useExpand(model === "on", modelStyle.windowMs);
  const from = boxStyle(grid, layout.window);
  const win = model === "on" ? lerpBox(from, boxStyle(grid, modelWindow(grid)), modelT) : from;
  // the 3D copy is built hidden once the rules have loaded (building it stalls the page for a moment, better while the
  // user reads than on the arrow click); a click before that builds it at once
  const sceneReady = useSiteStore((s) => !!s.scene && !s.loading);
  const [prewarm, setPrewarm] = useState(false);
  useEffect(() => {
    if (!panelOpen || !plot || !sceneReady) return setPrewarm(false);
    const id = setTimeout(() => setPrewarm(true), modelStyle.prewarmMs);
    return () => clearTimeout(id);
  }, [panelOpen, plot, sceneReady]);
  // once the plot has landed: the rules window's scene and the model's wider surroundings are asked for ahead (both requests
  // are shared with the later ones), so neither waits when the user goes on. Not during the flight: parsing them would cost frames.
  useEffect(() => {
    if (phase !== "plot" || !plot || !address) return;
    void fetchScene(address.label).catch(() => undefined);
    void fetchPlotContext(plot.id, contextRadius(plot.frameM)).catch(() => undefined);
  }, [phase, plot, address]);
  // the model's wider surroundings, fetched as soon as the rules open (the 2D plot falls back in when that fails)
  const [context, setContext] = useState<{ id: string; radiusM: number; plot: PlotData } | null>(null);
  useEffect(() => {
    if (!panelOpen || !plot) return;
    let live = true;
    const radiusM = contextRadius(plot.frameM);
    fetchPlotContext(plot.id, radiusM).then(
      (p) => live && setContext({ id: plot.id, radiusM, plot: p }),
      () => live && setContext({ id: plot.id, radiusM: plot.radiusM ?? plot.frameM * 1.1, plot }),
    );
    return () => {
      live = false;
    };
  }, [panelOpen, plot]);
  const modelContext = plot && context?.id === plot.id ? context : null;
  const handOver = useMemo(() => {
    if (!plot || !panelOpen) return null;
    // the frame of the 2D view at the hand-over: the inside of the (paired) window, the map grown to its full height
    const width = from.width - 2;
    const height = from.height - 2;
    const pxPerM = Math.min(width, height) / plot.frameM;
    const { level, fade } = plotLevel(pxPerM, globeStyle.dots.spacingPx);
    // the model square covers the whole 2D view at the hand-over (a little extra for rounding)
    return { pxPerM, level, fade };
  }, [plot, panelOpen, from.width, from.height]);
  const finalCells = modelWindow(grid);
  const finalBox = boxStyle(grid, finalCells);
  // the model can be turned: the arrow to the studio's Directions shows (its code is loaded while the model animates)
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (model !== "on") return setLive(false);
    void import("../App");
  }, [model]);
  // the arrow: one row high, five cells wide, one cell in from the model window's bottom-right corner
  const nextBox = boxStyle(grid, { c0: finalCells.c1 - 6, c1: finalCells.c1 - 1, r0: finalCells.r1 - 2, r1: finalCells.r1 - 1 });
  const hookTop = lineY(grid, layout.hookRow);
  const hidden = phase !== "idle" && phase !== "toIdle";

  return (
    <div className="landing" style={{ ...TOKEN_VARS, width: grid.width, height: grid.height }}>
      <GridLines grid={grid} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <button type="button" className="box logo t-semimono t-logo" style={boxStyle(grid, layout.logo)} onClick={() => window.location.reload()} aria-label="Massing Studio, reload the site">
          <span>
            <ShuffleText parts={[{ text: "MASSING" }]} />
          </span>
          <span>
            <ShuffleText parts={[{ text: "STUDIO" }]} />
          </span>
        </button>
        <GridToggle box={boxStyle(grid, layout.toggle)} on={overlay} onToggle={() => setOverlay((o) => !o)} />

        <div className="box window" style={win} />
        {modelContext && handOver && (prewarm || model !== "off") && (
          <Suspense fallback={null}>
            <SiteModel
              plot={modelContext.plot}
              radiusM={modelContext.radiusM}
              box={{ left: win.left + 1, top: win.top + 1, width: win.width - 2, height: win.height - 2 }}
              dpr={grid.dpr}
              startPxPerM={handOver.pxPerM}
              dotLevel={handOver.level}
              dotFade={handOver.fade}
              finalSize={{ w: finalBox.width - 2, h: finalBox.height - 2 }}
              envelope={envelope}
              origin={origin}
              // the window first travels to its place and grows to the square (windowMs); the 2D → 3D animation starts after that
              start={modelStart === null ? null : modelStart + modelStyle.windowMs}
              reducedMotion={reducedMotion}
              onReady={modelReady}
              onLive={() => setLive(true)}
            />
          </Suspense>
        )}
        <Globe faded={model === "on"} placement={shown} country={country} city={city} address={address} onSettled={settle} onResolve={startResolve} onWiden={startWiden} onPlotFailed={plotFailed} onPlot={setPlot} />
        <div className={`box hook${hidden ? " hidden" : ""}`} style={{ left: win.left, top: hookTop, width: win.width }} aria-hidden={hidden}>
          <h1 className="t-regular t-hook" style={{ margin: 0, height: TITLE_LINE }}>
            <ShuffleText parts={[{ text: "Every site has a future to discover" }]} active={!hidden} />
          </h1>
          <p className="t-semimono t-sub" style={{ margin: `${SUB_GAP}px 0 0` }}>
            <ShuffleText parts={[{ text: "Just drop a pin" }]} active={!hidden} />
          </p>
        </div>

        {live && model === "on" && (
          <button type="button" className="box go rules-go ready site-next" style={nextBox} aria-label="Directions" onClick={() => (window.location.hash = DIRECTIONS_HASH)}>
            <span className="go-label t-semimono">Directions</span>
            <img src={arrowUrl} alt="" />
          </button>
        )}
        {!panelOpen && <div className="box input-band" style={boxStyle(grid, layout.inputBand)} />}
        <CountryInput grid={grid} layout={layout} />
        {panelOpen && modelT < 1 && (
          <div className={`rules-leave${model === "on" ? " gone" : ""}`}>
            <RulesPanel grid={grid} layout={layout} />
          </div>
        )}
      </div>
      {overlay && <GridLines grid={grid} overlay />}
      {perfOn && <PerfHud />}
    </div>
  );
}
