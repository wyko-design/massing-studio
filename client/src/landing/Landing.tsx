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
import { useConstraints, useEnvelope, usePlaceholder, useSiteStore } from "../state/siteStore";
import { computeMassing, useMassing, useMassingStore } from "../state/massingStore";
import { usePresentStore } from "../state/presentStore";
import { useAiStore } from "../state/aiStore";
import { buildOverlay } from "../present/labels";
import { useLandingStore } from "./landingStore";
import { TOKEN_VARS } from "./tokens";
import { RulesPanel } from "./RulesPanel";
import { ShuffleText } from "./ShuffleText";
import { useGrid } from "./useGrid";
import { perfOn } from "./perf";
import { restoreStudio } from "./restore";
import { DIRECTIONS_HASH, isStudioHash, screenOfHash } from "../routes";
import { studioLayout } from "../studio/layout";
import { PerfHud } from "./PerfHud";

// the site model (three.js) loads only when it is needed; RulesPanel preloads it
const SiteModel = lazy(() => import("./model/SiteModel"));
// the studio's panels (and the report writer behind them) load while the model's intro plays
const loadStudio = () => import("../studio/Studio");
const StudioPanels = lazy(() => loadStudio().then((m) => ({ default: m.StudioPanels })));

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

/** The location hash, kept current. */
function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

/**
 * What the studio adds to the site model: the shown option's mass (or the one an export asks for), the envelope switch,
 * the look, and the label layer (Present and exports).
 */
function useStudioScene(presenting: boolean) {
  const scene = useSiteStore((s) => s.scene);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  const placeholder = usePlaceholder();
  const active = useMassingStore((s) => s.active);
  const massing = useMassing(active);
  const present = usePresentStore();
  const names = useAiStore((s) => s.directions.result?.options);
  const option = present.job?.option ?? active;
  const jobMassing = useMemo(() => (present.job ? computeMassing(present.job.option) : null), [present.job]);
  const shown = present.job ? jobMassing : massing;
  const name = names?.find((o) => o.id === option)?.name;
  const overlay = useMemo(
    () =>
      scene && (presenting || present.job)
        ? buildOverlay({
            scene,
            envelope,
            showEnvelope,
            result: shown,
            optionId: option,
            optionName: name,
            streetSide: constraints?.streetSide?.value ?? null,
            annotations: present.annotations,
            streetLabels: present.streetLabels,
            placeholder,
          })
        : null,
    [scene, presenting, present.job, envelope, showEnvelope, shown, option, name, constraints, present.annotations, present.streetLabels, placeholder],
  );
  return { proposal: shown?.volumes ?? null, showEnvelope, overlay, look: present.style.look, labels: present.style.labels };
}

/** Eases from where it is to `to` (0 or 1) over `ms`, both ways. */
function useSlide(to: 0 | 1, ms: number): number {
  const [t, setT] = useState<number>(to);
  const now = useRef(t);
  now.current = t;
  useEffect(() => {
    const from = now.current;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const step = (time: number) => {
      const x = Math.min(1, (time - start) / ms);
      setT(from + (to - from) * x * x * (3 - 2 * x));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return t;
}

/**
 * Entry screen (UI-1): page grid, logo, window with the globe and the country step. After the rules, the window becomes
 * the site model's square, and once its intro has played the studio opens around it (#studio/directions, /present,
 * /rules). Opened directly at #studio, the default site is loaded and the model starts at its end view.
 */
export function Landing() {
  const grid = useGrid(LANDING_MIN_ROWS);
  const hash = useHash();
  const [direct] = useState(() => isStudioHash(window.location.hash) && !useLandingStore.getState().plot);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  useEffect(() => {
    if (direct) restoreStudio().catch((e) => setRestoreError(e instanceof Error ? e.message : String(e)));
  }, [direct]);
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
  const modelT = useExpand(model === "on", direct ? 1 : modelStyle.windowMs);
  const from = boxStyle(grid, layout.window);
  // the studio: once the model can be turned, its panels open around the square; on the rules screen the square moves left
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (model !== "on") return setLive(false);
    void loadStudio();
  }, [model]);
  const studio = model === "on" && live && isStudioHash(hash);
  const screen = screenOfHash(hash);
  const studioCells = studioLayout(grid);
  const rulesT = useSlide(studio && screen === "rules" ? 1 : 0, 600);
  const squareBox = lerpBox(boxStyle(grid, studioCells.square), boxStyle(grid, studioCells.rulesSquare), rulesT);
  const win = model === "on" ? (modelT < 1 ? lerpBox(from, squareBox, modelT) : squareBox) : from;
  const studioScene = useStudioScene(studio && screen === "present");
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
  const finalBox = boxStyle(grid, modelWindow(grid));
  const hookTop = lineY(grid, layout.hookRow);
  const hidden = phase !== "idle" && phase !== "toIdle";

  return (
    <div className={`landing${studio ? " studio" : ""}`} style={{ ...TOKEN_VARS, width: grid.width, height: grid.height }}>
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
              look={studioScene.look}
              proposal={studioScene.proposal}
              showEnvelope={studioScene.showEnvelope}
              overlay={studioScene.overlay}
              labels={studioScene.labels}
            />
          </Suspense>
        )}
        {!direct && <Globe faded={model === "on"} placement={shown} country={country} city={city} address={address} onSettled={settle} onResolve={startResolve} onWiden={startWiden} onPlotFailed={plotFailed} onPlot={setPlot} />}
        {direct && !live && (
          <div className="box site-loading t-semimono" style={win}>
            <ShuffleText parts={[{ text: restoreError ? `Could not load the site: ${restoreError}` : "Loading the site" }]} scrambling={!restoreError} />
          </div>
        )}
        <div className={`box hook${hidden || direct ? " hidden" : ""}`} style={{ left: win.left, top: hookTop, width: win.width }} aria-hidden={hidden || direct}>
          <h1 className="t-regular t-hook" style={{ margin: 0, height: TITLE_LINE }}>
            <ShuffleText parts={[{ text: "Every site has a future to discover" }]} active={!hidden} />
          </h1>
          <p className="t-semimono t-sub" style={{ margin: `${SUB_GAP}px 0 0` }}>
            <ShuffleText parts={[{ text: "Just drop a pin" }]} active={!hidden} />
          </p>
        </div>

        {!panelOpen && <div className="box input-band" style={boxStyle(grid, layout.inputBand)} />}
        {!direct && <CountryInput grid={grid} layout={layout} />}
        {panelOpen && modelT < 1 && !direct && (
          <div className={`rules-leave${model === "on" ? " gone" : ""}`}>
            {/* "Start exploring" goes straight to Directions: the model's intro plays, then the studio opens around it */}
            <RulesPanel
              grid={grid}
              layout={layout}
              onContinue={() => {
                useLandingStore.getState().openModel();
                window.location.hash = DIRECTIONS_HASH;
              }}
            />
          </div>
        )}
        {studio && (
          <Suspense fallback={null}>
            <StudioPanels grid={grid} layout={studioCells} screen={screen} />
          </Suspense>
        )}
      </div>
      {overlay && <GridLines grid={grid} overlay />}
      {perfOn && <PerfHud />}
    </div>
  );
}
