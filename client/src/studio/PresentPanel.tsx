import { useState, type CSSProperties } from "react";
import { isoParts, zonedIso } from "@massing/shared";
import areaIcon from "../landing/assets/rules/area.svg";
import coverageIcon from "../landing/assets/rules/coverage.svg";
import externalIcon from "../landing/assets/rules/external.svg";
import heightIcon from "../landing/assets/rules/height.svg";
import overrideIcon from "../landing/assets/rules/override.svg";
import setbacksIcon from "../landing/assets/rules/setbacks.svg";
import subIcon from "../landing/assets/rules/sub.svg";
import suggestIcon from "../landing/assets/rules/suggest.svg";
import type { Grid } from "../landing/grid";
import type { TextPart } from "../landing/ShuffleText";
import { usePresentStore } from "../state/presentStore";
import { useConstraints, useSiteStore } from "../state/siteStore";
import { useMassing, useMassingStore } from "../state/massingStore";
import { useAiStore } from "../state/aiStore";
import { PRESETS, focusOf, type Preset } from "../present/camera";
import { ASPECTS, MULTIPLIERS, exportSize, type Aspect, type Multiplier } from "../present/frame";
import { CONTEXT_STYLES, LOOKS, type ContextStyle, type LookId } from "../viewer/renderStyle";
import { generateReport, type ReportResult } from "../report/generate";
import { PanelFrame, type Tab } from "./PanelFrame";
import { ActionRow, Note, Range, Section, SegmentRow, Segments, SliderRow, Title, ToggleRow, ValueRow } from "./rows";
import type { StudioLayout } from "./layout";

type TabId = "camera" | "look" | "output";

/** The sun is computed for wall-clock time at the site (NL implementation). */
const SITE_TIME_ZONE = "Europe/Amsterdam";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Report = { status: "idle" } | { status: "working"; message: string } | { status: "error"; message: string } | { status: "done"; result: ReportResult };

/** Camera: the presets (two rows of three), the saved view, the projection. */
function CameraTab() {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  const constraints = useConstraints();
  const active = useMassingStore((s) => s.active);
  const massing = useMassing(active);
  if (!scene) return null;
  const streetSide = constraints?.streetSide?.value ?? null;
  const focus = focusOf(scene.parcel.ring, massing?.volumes);
  const presets = Object.keys(PRESETS) as Preset[];
  const saved = p.savedViews[scene.parcel.id];
  const pick = (k: Preset) => p.applyPreset(k, focus, streetSide);
  return (
    <>
      <Section label="Views" hint="fitted to the plot and the option" />
      {[presets.slice(0, 3), presets.slice(3)].map((row, i) => (
        <li key={i} className="row full">
          {/* presets are actions, not states: none stays pressed */}
          <Segments<Preset | "">
            value=""
            label={i === 0 ? "Axonometric views" : "Other views"}
            onChange={(k) => k && pick(k)}
            options={row.map((k) => ({ value: k, text: PRESETS[k], title: k === "eye" && streetSide === null ? "Street side unknown: looks from the south" : undefined }))}
          />
        </li>
      ))}
      <SegmentRow
        icon={setbacksIcon}
        label="Projection"
        value={p.projection}
        onChange={p.switchProjection}
        options={[
          { value: "ortho", text: "Axonometric" },
          { value: "perspective", text: "Perspective" },
        ]}
      />
      <Section label="Saved view" hint="this browser only" />
      <ActionRow icon={subIcon} label="Save this view" onClick={() => p.saveView(scene.parcel.id)} note={saved ? <span className="muted">one view per plot, replaces the last</span> : undefined} />
      <ActionRow icon={overrideIcon} label="Back to the saved view" disabled={!saved} onClick={() => p.restoreView(scene.parcel.id)} />
      <Note small muted>
        Drag to turn, right-drag to pan, wheel to zoom. The frame is the exported image.
      </Note>
    </>
  );
}

/** Look: lines or sun, the context, the outline, what is drawn; the sun's date and time in the sun look. */
function LookTab() {
  const p = usePresentStore();
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const constraints = useConstraints();
  const streetSide = constraints?.streetSide?.value ?? null;
  const sun = p.style.look === "sun";
  const { date, time } = isoParts(p.style.light.date);
  const setSun = (d: string, t: string) => p.setStyle("light", { date: zonedIso(d, t, SITE_TIME_ZONE) });
  return (
    <>
      <Section label="Look" />
      <SegmentRow<LookId> icon={subIcon} label="Drawing" value={p.style.look} onChange={(look) => p.setLook(look)} options={(Object.keys(LOOKS) as LookId[]).map((k) => ({ value: k, text: LOOKS[k] }))} />
      <SegmentRow<ContextStyle>
        icon={areaIcon}
        label="Context"
        value={p.style.context.style}
        onChange={(style) => p.setStyle("context", { style })}
        options={(Object.keys(CONTEXT_STYLES) as ContextStyle[]).map((k) => ({ value: k, text: k === "white" ? "White" : "Grey" }))}
      />
      <SliderRow icon={coverageIcon} label="Outline" value={p.style.proposal.outlineWidth} spec={{ min: 0, max: 4, step: 0.5, unit: "px" }} onChange={(outlineWidth) => p.setStyle("proposal", { outlineWidth })} />
      <Section label="Show" />
      <ToggleRow icon={areaIcon} label="Envelope ghost" on={showEnvelope} onChange={setShowEnvelope} />
      <ToggleRow icon={setbacksIcon} label="Street labels" on={p.streetLabels} onChange={(on) => p.setToggle("streetLabels", on)} note={streetSide === null ? "street side unknown" : undefined} />
      <ToggleRow icon={subIcon} label="Annotations" on={p.annotations} onChange={(on) => p.setToggle("annotations", on)} />
      <Section label="Sun" hint={sun ? `${SITE_TIME_ZONE.split("/")[1]} time` : "in the sun look"} />
      <li className="row wide">
        <Title icon={heightIcon} label="Date" />
        <div className="cell-value" style={{ borderRight: 0 }}>
          <label className="rules-num t-semimono known">
            <input type="date" value={date} disabled={!sun} aria-label="Date" onChange={(e) => e.target.value && setSun(e.target.value, time)} style={{ fieldSizing: "fixed" } as CSSProperties} />
          </label>
        </div>
      </li>
      <li className="row">
        <Title icon={heightIcon} turned label="Time" />
        <div className="cell-value static t-semimono">{timeOf(minutesOf(time))}</div>
        <div className="cell-slider">
          <Range value={minutesOf(time)} min={300} max={1320} step={15} label="Time" disabled={!sun} onChange={(m) => setSun(date, timeOf(m))} />
        </div>
      </li>
      <SliderRow icon={coverageIcon} label="Softness" value={p.style.light.shadowSoftness} spec={{ min: 1, max: 16, step: 1 }} disabled={!sun} onChange={(shadowSoftness) => p.setStyle("light", { shadowSoftness })} />
      <ToggleRow icon={subIcon} label="Ambient occlusion" on={p.style.ao.enabled} disabled={!sun} onChange={(enabled) => p.setStyle("ao", { enabled })} />
    </>
  );
}

/** Output: frame and size of the PNG, the PDF report and what the last exports produced. */
function OutputTab({ report, writeNarrative, setWriteNarrative }: { report: Report; writeNarrative: boolean; setWriteNarrative: (on: boolean) => void }) {
  const p = usePresentStore();
  const hasDirections = useAiStore((s) => s.directions.status === "done");
  const size = exportSize(p.aspect, p.multiplier);
  const ex = p.exportState;
  return (
    <>
      <Section label="Image" hint="PNG" />
      <SegmentRow<Aspect> icon={areaIcon} label="Frame" value={p.aspect} onChange={p.setAspect} options={(Object.keys(ASPECTS) as Aspect[]).map((a) => ({ value: a, text: ASPECTS[a].label.replace(" portrait", "").replace(" square", "").replace(" landscape", "") }))} />
      <SegmentRow<Multiplier> icon={coverageIcon} label="Resolution" value={p.multiplier} onChange={p.setMultiplier} options={MULTIPLIERS.map((m) => ({ value: m, text: `${m}×` }))} />
      <ValueRow icon={subIcon} label="Size" value={`${size.width} × ${size.height}`} note={<span className="muted">px</span>} />
      {ex.status === "done" && (
        <Note small>
          Saved {ex.fileName}, {(ex.bytes / 1e6).toFixed(1)} MB in {(ex.ms / 1000).toFixed(1)} s.{" "}
          <a className="band-link" href={ex.url} target="_blank" rel="noreferrer">
            Open
            <img src={externalIcon} alt="" width={12} height={12} />
          </a>
        </Note>
      )}
      {ex.status === "error" && <Note accent>{ex.message}</Note>}
      <Section label="Report" hint="PDF: every option, its numbers and rules" />
      <ToggleRow icon={suggestIcon} label="Narrative by the AI" on={writeNarrative && hasDirections} disabled={!hasDirections} onChange={setWriteNarrative} note={hasDirections ? "numbers filled in by code" : "generate directions first"} />
      {report.status === "done" && (
        <Note small>
          Saved {report.result.fileName}, {(report.result.bytes / 1e6).toFixed(1)} MB.{" "}
          <a className="band-link" href={report.result.url} target="_blank" rel="noreferrer">
            Open
            <img src={externalIcon} alt="" width={12} height={12} />
          </a>
          {report.result.narrative === "failed" && <div>No narrative: {report.result.narrativeError}</div>}
          {report.result.narrative === "cached" && <div>Narrative replayed from the cache.</div>}
        </Note>
      )}
      {report.status === "error" && <Note accent>{report.message}</Note>}
      <Note small muted>
        Indicative early study. Not a permit check.
      </Note>
    </>
  );
}

/** Present: camera, look and output of the shown option. The arrow exports the PNG; the outlined button writes the PDF. */
export function PresentPanel({ grid, layout, onBack }: { grid: Grid; layout: StudioLayout; onBack: () => void }) {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  const active = useMassingStore((s) => s.active);
  const hasDirections = useAiStore((s) => s.directions.status === "done");
  const [tab, setTab] = useState<TabId>("camera");
  const [writeNarrative, setWriteNarrative] = useState(true);
  const [report, setReport] = useState<Report>({ status: "idle" });
  const ex = p.exportState;
  const makeReport = () => {
    setReport({ status: "working", message: "Starting" });
    setTab("output");
    generateReport({ narrative: writeNarrative && hasDirections }, (message) => setReport({ status: "working", message: message.replace(/…$/, "") })).then(
      (result) => setReport({ status: "done", result }),
      (e) => setReport({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const fileName = scene ? `massing-${fileSafe(scene.parcel.id)}-option-${active}-${fileSafe(p.aspect)}-${p.multiplier}x.png` : "massing.png";
  const size = exportSize(p.aspect, p.multiplier);

  let status: TextPart[];
  let busy = false;
  if (report.status === "working") {
    status = [{ text: report.message }];
    busy = true;
  } else if (ex.status === "rendering") {
    status = [{ text: `Rendering ${size.width} × ${size.height}` }];
    busy = true;
  } else if (report.status === "error") status = [{ text: "Report failed: ", className: "accent" }, { text: report.message }];
  else if (ex.status === "error") status = [{ text: "Export failed: ", className: "accent" }, { text: ex.message }];
  else if (report.status === "done") status = [{ text: "Report saved", className: "accent" }, { text: `, ${report.result.fileName}` }];
  else if (ex.status === "done") status = [{ text: "Image saved", className: "accent" }, { text: `, ${ex.width} × ${ex.height} px` }];
  else status = [{ text: `Option ${active}`, className: "accent" }, { text: `, ${size.width} × ${size.height} px` }];

  const tabs: Tab<TabId>[] = [
    { id: "camera", label: "Camera" },
    { id: "look", label: "Look" },
    { id: "output", label: "Output" },
  ];
  const working = report.status === "working" || ex.status === "rendering";
  return (
    <PanelFrame
      grid={grid}
      panel={layout.panel}
      band={layout.panelBand}
      heading={["Present", "and export"]}
      onBack={onBack}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={status}
      busy={busy}
      secondary={{ label: "Write PDF report", icon: suggestIcon, disabled: working || !scene, onClick: makeReport, title: "Renders every option and writes the report" }}
      go={{ label: "Export PNG", disabled: working || !scene, onClick: () => p.startExport(fileName) }}
    >
      {tab === "camera" ? <CameraTab /> : tab === "look" ? <LookTab /> : <OutputTab report={report} writeNarrative={writeNarrative} setWriteNarrative={setWriteNarrative} />}
    </PanelFrame>
  );
}
