import { useEffect, useMemo, useState, type CSSProperties } from "react";
import "./landing/landing.css";
import "./studio/studio.css";
import { ExportCanvas } from "./viewer/ExportCanvas";
import { useConstraints, useEnvelope, usePlaceholder, useSiteStore } from "./state/siteStore";
import { computeMassing, useMassing, useMassingStore } from "./state/massingStore";
import { usePresentStore } from "./state/presentStore";
import { useAiStore } from "./state/aiStore";
import { buildOverlay } from "./present/labels";
import { focusOf, orbitView, type View } from "./present/camera";
import { GridLines } from "./landing/GridLines";
import { GridToggle } from "./landing/GridToggle";
import { ShuffleText } from "./landing/ShuffleText";
import { boxStyle, lerpBox, modelWindow, type BoxStyle } from "./landing/grid";
import { useGrid } from "./landing/useGrid";
import { useLandingStore } from "./landing/landingStore";
import { modelStyle } from "./landing/model/modelStyle";
import { TOKEN_VARS } from "./landing/tokens";
import { RulesPanel } from "./landing/RulesPanel";
import { SCREEN_HASH, screenOfHash, type StudioScreen } from "./routes";
import { STUDIO_MIN_ROWS, studioLayout } from "./studio/layout";
import { DirectionsPanel } from "./studio/DirectionsPanel";
import { PresentPanel } from "./studio/PresentPanel";
import { ViewerWindow } from "./studio/ViewerWindow";

/** 0 → 1 over `ms` (smoothstep) from the first render when `on`; 1 at once otherwise. */
function useTravel(on: boolean, ms: number): number {
  const [t, setT] = useState(on ? 0 : 1);
  useEffect(() => {
    if (!on) return;
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

/** Back to the landing's first step: a fresh page (the globe cannot resume mid-flow). */
function toLanding() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.location.reload();
}

/**
 * The studio, after the landing: the page grid with the logo, a viewer window (the 3D model and the option switcher) and a
 * panel window beside it: the rules (as on the landing), Directions (brief, option, check) or Present (camera, look,
 * output). Coming from the landing's site model, the viewer window travels from where the model window was.
 */
export function App({ hash }: { hash: string }) {
  const screen = screenOfHash(hash);
  const go = (s: StudioScreen) => {
    window.location.hash = SCREEN_HASH[s];
  };
  const grid = useGrid(STUDIO_MIN_ROWS);
  const layout = studioLayout(grid);
  const [overlayGrid, setOverlayGrid] = useState(false);

  const scene = useSiteStore((s) => s.scene);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  const placeholder = usePlaceholder();
  const active = useMassingStore((s) => s.active);
  const massing = useMassing(active);
  const optionName = useAiStore((s) => s.directions.result?.options.find((o) => o.id === active)?.name);
  const present = usePresentStore();

  // coming from the landing, the chosen site is already loaded: keep it (and its rules) instead of the default site
  useEffect(() => {
    if (!useSiteStore.getState().scene) void useSiteStore.getState().load();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setOverlayGrid((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the hand-over from the landing's site model: its window travels and grows into the viewer window, then the panel opens
  const [fromModel] = useState(() => useLandingStore.getState().model === "on");
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const t = useTravel(fromModel && !reducedMotion, modelStyle.windowMs);
  const landed = t >= 1;
  const viewerBox: BoxStyle = fromModel ? lerpBox(boxStyle(grid, modelWindow(grid)), boxStyle(grid, layout.viewer), t) : boxStyle(grid, layout.viewer);

  // the starting camera: the landing's end view (same angle and scale), else fitted to the plot
  const [startView] = useState<{ frameM: number | null; width: number }>(() => ({
    frameM: useLandingStore.getState().plot?.frameM ?? null,
    width: boxStyle(grid, modelWindow(grid)).width - 2,
  }));
  const initialView = useMemo<View | null>(() => {
    if (!scene) return null;
    const { elevation, azimuth } = present.style.camera;
    const focus = focusOf(scene.parcel.ring);
    const canvas = boxStyle(grid, layout.canvas);
    const zoom = startView.frameM ? startView.width / (modelStyle.camera.viewFrames * startView.frameM) : Math.min(canvas.width, canvas.height) / (2 * focus.radius);
    return orbitView([focus.centre[0], 0, -focus.centre[1]], azimuth, elevation, zoom);
    // the viewer reads it once, when it mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.parcel.id]);

  const presenting = screen === "present";
  const style = useMemo(() => ({ ...present.style, envelope: { ...present.style.envelope, visible: showEnvelope } }), [present.style, showEnvelope]);

  // the option on screen, or the one a running export / report render asks for
  const jobOption = present.job?.option ?? active;
  const jobMassing = useMemo(() => (present.job ? computeMassing(jobOption) : null), [present.job, jobOption]);
  const shown = present.job ? jobMassing : massing;
  const directionNames = useAiStore((s) => s.directions.result?.options);
  const shownName = present.job ? directionNames?.find((o) => o.id === jobOption)?.name : optionName;
  const overlay = useMemo(
    () =>
      scene
        ? buildOverlay({
            scene,
            envelope,
            showEnvelope,
            result: shown,
            optionId: jobOption,
            optionName: shownName,
            streetSide: constraints?.streetSide?.value ?? null,
            annotations: present.annotations,
            streetLabels: present.streetLabels,
            placeholder,
          })
        : null,
    [scene, envelope, showEnvelope, shown, jobOption, shownName, constraints, present.annotations, present.streetLabels, placeholder],
  );

  const panel =
    screen === "rules" ? (
      <RulesPanel grid={grid} layout={layout} instant onBack={toLanding} onContinue={() => go("directions")} continueLabel="Directions" />
    ) : screen === "directions" ? (
      <DirectionsPanel grid={grid} layout={layout} onBack={() => go("rules")} onPresent={() => go("present")} />
    ) : (
      <PresentPanel grid={grid} layout={layout} onBack={() => go("directions")} />
    );

  const page: CSSProperties = { ...TOKEN_VARS, width: grid.width, height: grid.height };
  return (
    <div className="landing studio" style={page}>
      <GridLines grid={grid} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <button type="button" className="box logo t-semimono t-logo" style={boxStyle(grid, layout.logo)} onClick={toLanding} aria-label="Massing Studio, back to the start">
          <span>
            <ShuffleText parts={[{ text: "MASSING" }]} />
          </span>
          <span>
            <ShuffleText parts={[{ text: "STUDIO" }]} />
          </span>
        </button>
        <GridToggle box={boxStyle(grid, layout.toggle)} on={overlayGrid} onToggle={() => setOverlayGrid((o) => !o)} />
        <ViewerWindow
          grid={grid}
          layout={layout}
          box={viewerBox}
          landed={landed}
          presenting={presenting}
          style={style}
          proposal={massing?.volumes}
          overlay={presenting ? overlay : null}
          initialView={initialView}
        />
        {landed && <div key={screen}>{panel}</div>}
      </div>
      {scene && present.job && (
        <ExportCanvas job={present.job} scene={scene} envelope={envelope} proposal={shown?.volumes} style={style} overlay={overlay} onDone={present.finishExport} />
      )}
      {overlayGrid && <GridLines grid={grid} overlay />}
    </div>
  );
}
