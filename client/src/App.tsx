import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Viewer } from "./viewer/Viewer";
import { ExportCanvas } from "./viewer/ExportCanvas";
import { useConstraints, useEnvelope, usePlaceholder, useSiteStore } from "./state/siteStore";
import { SiteScreen } from "./screens/SiteScreen";
import { ConstraintsScreen } from "./screens/ConstraintsScreen";
import { DirectionsScreen } from "./screens/DirectionsScreen";
import { PresentScreen } from "./screens/PresentScreen";
import { computeMassing, useMassing, useMassingStore } from "./state/massingStore";
import { usePresentStore } from "./state/presentStore";
import { useAiStore } from "./state/aiStore";
import { ASPECTS, fitFrame } from "./present/frame";
import { buildOverlay } from "./present/labels";
import { panel } from "./screens/panel";

const SCREENS = { site: "Site", constraints: "Constraints", directions: "Directions", present: "Present" } as const;
type Screen = keyof typeof SCREENS;

/** Free area for the design frame in Present mode: right of the settings panel, below the tabs. */
const FRAME_AREA = { left: 334, top: 48, right: 12, bottom: 12 };

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("site");
  const scene = useSiteStore((s) => s.scene);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  const placeholder = usePlaceholder();
  const active = useMassingStore((s) => s.active);
  const colour = useMassingStore((s) => s.options[active].colour);
  const massing = useMassing(active);
  const optionName = useAiStore((s) => s.directions.result?.options.find((o) => o.id === active)?.name);
  const present = usePresentStore();
  const jobColour = useMassingStore((s) => s.options[present.job?.option ?? s.active].colour);
  const win = useWindowSize();

  useEffect(() => void useSiteStore.getState().load(), []);

  const presenting = screen === "present";
  const style = useMemo(
    () => ({
      ...present.style,
      envelope: { ...present.style.envelope, visible: showEnvelope },
      proposal: { ...present.style.proposal, colour },
    }),
    [present.style, showEnvelope, colour],
  );
  const proposal = screen === "directions" || presenting ? massing?.volumes : undefined;

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

  // Present: the viewer is laid out at the design frame's CSS size and scaled to fit (same element, no remount)
  const base = ASPECTS[present.aspect];
  const fit = fitFrame(win.width - FRAME_AREA.left - FRAME_AREA.right, win.height - FRAME_AREA.top - FRAME_AREA.bottom, base);
  const frameStyle: CSSProperties = presenting
    ? {
        position: "absolute",
        left: FRAME_AREA.left + fit.left,
        top: FRAME_AREA.top + fit.top,
        width: base.width,
        height: base.height,
        transform: `scale(${fit.k})`,
        transformOrigin: "0 0",
        boxShadow: "0 1px 12px rgba(0,0,0,0.25)",
      }
    : { position: "absolute", inset: 0 };
  // render the scaled frame at about the screen's pixel density
  const dpr = presenting ? Math.min(2, Math.max(0.5, window.devicePixelRatio * fit.k)) : undefined;

  return (
    <div style={{ height: "100%", position: "relative", background: presenting ? "#c9c9c6" : undefined }}>
      <div style={frameStyle}>
        {scene && <Viewer scene={scene} envelope={envelope} proposal={proposal} style={style} overlay={presenting ? overlay : null} dpr={dpr} />}
      </div>
      {scene && present.job && (
        <ExportCanvas job={present.job} scene={scene} envelope={envelope} proposal={shown?.volumes} style={{ ...style, proposal: { ...style.proposal, colour: jobColour } }} overlay={overlay} onDone={present.finishExport} />
      )}
      <nav style={{ ...panel, left: 12, top: 12, display: "flex", gap: 4, alignItems: "center" }}>
        {(Object.keys(SCREENS) as Screen[]).map((key) => (
          <button
            key={key}
            onClick={() => setScreen(key)}
            aria-pressed={screen === key}
            style={{ fontWeight: screen === key ? 700 : 400, fontFamily: "inherit" }}
          >
            {SCREENS[key]}
          </button>
        ))}
        {scene && placeholder && (
          <span
            title="At least one planning value is assumed. Exports carry a watermark."
            style={{ marginLeft: 8, padding: "2px 6px", background: "#111", color: "#ffd24d", fontWeight: 700, letterSpacing: 0.5 }}
          >
            PLACEHOLDER DATA
          </span>
        )}
      </nav>
      {screen === "site" ? <SiteScreen /> : screen === "constraints" ? <ConstraintsScreen /> : screen === "directions" ? <DirectionsScreen /> : <PresentScreen />}
    </div>
  );
}
