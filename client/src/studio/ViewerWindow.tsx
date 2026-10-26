import { useMemo, useRef, type CSSProperties } from "react";
import { TYPOLOGY_LABELS, type Volume } from "@massing/shared";
import { boxStyle, type BoxStyle, type Grid } from "../landing/grid";
import { ShuffleText, type TextPart } from "../landing/ShuffleText";
import { globeStyle } from "../landing/globe/globeStyle";
import { useEnvelope, usePlaceholder, useSiteStore } from "../state/siteStore";
import { OPTION_IDS, useMassing, useMassingStore, type OptionId } from "../state/massingStore";
import { usePresentStore } from "../state/presentStore";
import { useAiStore } from "../state/aiStore";
import { cameraHandle } from "../viewer/cameraHandle";
import { Viewer } from "../viewer/Viewer";
import type { RenderStyle } from "../viewer/renderStyle";
import { ASPECTS, fitFrame } from "../present/frame";
import type { View } from "../present/camera";
import type { Overlay } from "../present/labels";
import type { StudioLayout } from "./layout";

/** Gap between the band's label line and the option buttons (the landing's input band). */
const LABEL_GAP = 4;
const LABEL_LINE = 12;
/** Cells the key numbers need at the band's right; the option buttons share the rest (4 to 7 cells each). */
const METRICS_CELLS = 10;
const optionCells = (bandCols: number) => Math.max(4, Math.min(7, Math.floor((bandCols - 3 - METRICS_CELLS) / 3)));
/** Room around the design frame in Present (px). */
const FRAME_INSET = 24;

/** White inner wash along the four edges (`width` px, quadratic falloff), as the landing's maps and site model draw it. */
function washBackground(width: number): string {
  const stops = Array.from({ length: 9 }, (_, i) => `rgba(255,255,255,${((1 - i / 8) ** 2).toFixed(4)}) ${((width * i) / 8).toFixed(1)}px`).join(", ");
  return ["to bottom", "to top", "to right", "to left"].map((dir) => `linear-gradient(${dir}, ${stops})`).join(", ");
}

const fmt = (x: number, digits = 1) => x.toFixed(digits);

/** One option button: its letter in a chip, the AI's name for it (else its typology). */
function OptionButton({ id, box }: { id: OptionId; box: BoxStyle }) {
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const typology = useMassingStore((s) => s.options[id].typology);
  const name = useAiStore((s) => s.directions.result?.options.find((o) => o.id === id)?.name);
  const label = name ?? TYPOLOGY_LABELS[typology];
  return (
    <button type="button" className="box option t-semimono" style={box} aria-pressed={active === id} onClick={() => setActive(id)} title={`Option ${id}: ${label}`}>
      <span className="chip">{id}</span>
      <span className="option-name">{label}</span>
    </button>
  );
}

/** The shown option's key numbers, computed (never the model's). */
function Metrics({ style }: { style: CSSProperties }) {
  const active = useMassingStore((s) => s.active);
  const result = useMassing(active);
  if (!result) return null;
  const m = result.metrics;
  return (
    <div className="box viewer-metrics t-semimono" style={style}>
      <span>
        GFA <b>{fmt(m.gfa, 0)} m²</b>
      </span>
      <span>
        FAR <b>{fmt(m.far, 2)}</b>
      </span>
      <span>
        <b>{fmt(m.height)} m</b>
      </span>
      <span>
        <b>{m.estUnits}</b> {m.estUnits === 1 ? "home" : "homes"}
      </span>
    </div>
  );
}

type Props = {
  grid: Grid;
  layout: StudioLayout;
  /** The window's box now (it travels in from the landing's model window). */
  box: BoxStyle;
  /** The window has arrived: its band and tools show. */
  landed: boolean;
  presenting: boolean;
  style: RenderStyle;
  proposal: Volume[] | undefined;
  overlay: Overlay | null;
  initialView: View | null;
};

/**
 * The viewer window: the model above, the option switcher and the key numbers in the band below (the landing's input band).
 * In Present the model is the export's design frame, scaled to fit, on the page background. The viewer element stays the
 * same in both, so the camera is kept.
 */
export function ViewerWindow({ grid, layout, box, landed, presenting, style, proposal, overlay, initialView }: Props) {
  const scene = useSiteStore((s) => s.scene);
  const loading = useSiteStore((s) => s.loading);
  const error = useSiteStore((s) => s.error);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const envelope = useEnvelope();
  const placeholder = usePlaceholder();
  const aspect = usePresentStore((s) => s.aspect);
  const hasDirections = useAiStore((s) => s.directions.status === "done");
  // the camera the viewer starts with: the first one there is (the site may still be loading at mount)
  const firstRef = useRef<View | null>(null);
  if (!firstRef.current && initialView) firstRef.current = initialView;
  const first = firstRef.current;
  const wash = useMemo(() => washBackground(globeStyle.vignetteWidth), []);

  // the canvas: the window's inside above its band (the whole inside while it travels)
  const bandTop = boxStyle(grid, layout.viewerBand).top;
  const inside: BoxStyle = landed
    ? { left: box.left + 1, top: box.top + 1, width: box.width - 2, height: bandTop - box.top - 1 }
    : { left: box.left + 1, top: box.top + 1, width: box.width - 2, height: box.height - 2 };

  // Present: the design frame at its CSS size, scaled into the canvas
  const base = ASPECTS[aspect];
  const fit = fitFrame(inside.width - 2 * FRAME_INSET, inside.height - 2 * FRAME_INSET, base);
  const outer: CSSProperties = presenting
    ? { left: FRAME_INSET + fit.left, top: FRAME_INSET + fit.top, width: base.width * fit.k, height: base.height * fit.k }
    : { left: 0, top: 0, width: inside.width, height: inside.height, outline: "none" };
  const inner: CSSProperties = presenting
    ? { position: "absolute", left: 0, top: 0, width: base.width, height: base.height, transform: `scale(${fit.k})`, transformOrigin: "0 0" }
    : { position: "absolute", inset: 0 };
  // render the scaled frame at about the screen's pixel density
  const dpr = presenting ? Math.min(2, Math.max(0.5, window.devicePixelRatio * fit.k)) : undefined;

  // band: label over the option buttons, the numbers at the right
  const band = layout.viewerBand;
  const row = band.r0 + 1;
  const cellsEach = optionCells(band.c1 - band.c0);
  const optionBox = (k: number) => boxStyle(grid, { c0: band.c0 + 1 + k * cellsEach, c1: band.c0 + 1 + (k + 1) * cellsEach, r0: row, r1: row + 1 });
  const first0 = optionBox(0);
  const labelStyle: CSSProperties = { left: first0.left, top: first0.top - LABEL_GAP - LABEL_LINE, height: LABEL_LINE, whiteSpace: "pre" };
  const metricsCells = { c0: band.c0 + 1 + 3 * cellsEach + 1, c1: band.c1 - 1, r0: row, r1: row + 1 };
  const metricsBox = metricsCells.c1 - metricsCells.c0 >= METRICS_CELLS - 1 ? boxStyle(grid, metricsCells) : null;
  const label: TextPart[] = hasDirections ? [{ text: "Three directions " }, { text: "by the AI", className: "accent" }] : [{ text: "Three starting points, " }, { text: "edit freely", className: "accent" }];

  const fitView = () => {
    if (first) cameraHandle()?.apply(first);
  };

  return (
    <>
      <div className="box window" style={box} />
      <div className={`box viewer-canvas${presenting ? " framing" : ""}`} style={inside}>
        {scene && first && (
          <div className="viewer-frame" style={{ position: "absolute", ...outer }}>
            <div style={inner}>
              <Viewer scene={scene} envelope={envelope} proposal={proposal} style={style} overlay={overlay} dpr={dpr} initialView={first} />
            </div>
          </div>
        )}
        {!presenting && <div className="site-wash" style={{ backgroundImage: wash }} />}
        {!scene && (
          <div className="viewer-empty t-semimono">
            <ShuffleText parts={[{ text: error ? `Could not load the site: ${error}` : "Loading the site" }]} scrambling={loading && !error} />
          </div>
        )}
        {landed && scene && placeholder && !presenting && (
          <span className="viewer-flag rules-tag unknown" title="At least one planning value is assumed. Exports carry a watermark.">
            PLACEHOLDER DATA
          </span>
        )}
        {landed && scene && !presenting && (
          <div className="viewer-tools t-semimono" role="group" aria-label="View">
            <button type="button" aria-pressed={showEnvelope} onClick={() => setShowEnvelope(!showEnvelope)} disabled={!envelope}>
              Envelope
            </button>
            <button type="button" onClick={fitView}>
              Fit view
            </button>
          </div>
        )}
      </div>
      {landed && (
        <>
          <div className="box input-band studio-in" style={boxStyle(grid, band)} />
          <label className="box t-semimono t-label studio-in" style={labelStyle}>
            <ShuffleText parts={label} />
          </label>
          {OPTION_IDS.map((id, k) => (
            <OptionButton key={id} id={id} box={optionBox(k)} />
          ))}
          {metricsBox && <Metrics style={metricsBox} />}
        </>
      )}
    </>
  );
}
