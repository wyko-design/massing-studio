import { useState } from "react";
import areaIcon from "../landing/assets/rules/area.svg";
import coverageIcon from "../landing/assets/rules/coverage.svg";
import externalIcon from "../landing/assets/rules/external.svg";
import overrideIcon from "../landing/assets/rules/override.svg";
import setbacksIcon from "../landing/assets/rules/setbacks.svg";
import subIcon from "../landing/assets/rules/sub.svg";
import suggestIcon from "../landing/assets/rules/suggest.svg";
import type { Grid } from "../landing/grid";
import type { TextPart } from "../landing/ShuffleText";
import { usePresentStore } from "../state/presentStore";
import { useConstraints, useEnvelope, useSiteStore } from "../state/siteStore";
import { OPTION_IDS, useMassingStore, type OptionId } from "../state/massingStore";
import { useAiStore } from "../state/aiStore";
import { HOME_VIEW, VIEW_PRESETS, siteView, type ViewPreset } from "../landing/model/siteView";
import { MULTIPLIERS, exportSide, type Multiplier } from "../present/frame";
import { LOOKS, type LookId } from "../viewer/renderStyle";
import { generateReport, type ReportResult } from "../report/generate";
import { PanelFrame, type Tab } from "./PanelFrame";
import { ActionRow, Note, Section, SegmentRow, Segments, ToggleRow, ValueRow } from "./rows";
import type { PanelCells } from "./layout";

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Report = { status: "idle" } | { status: "working"; message: string } | { status: "error"; message: string } | { status: "done"; result: ReportResult };

/** Camera: the presets, the saved view. */
function CameraTab() {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  if (!scene) return null;
  const saved = p.savedViews[scene.parcel.id];
  const presets = Object.keys(VIEW_PRESETS) as ViewPreset[];
  return (
    <>
      <Section label="Views" hint="isometric, from a corner" />
      <li className="row full">
        {/* presets are actions, not states: none stays pressed */}
        <Segments<ViewPreset | ""> value="" label="Views" onChange={(k) => k && p.applyPreset(k)} options={presets.map((k) => ({ value: k, text: VIEW_PRESETS[k] }))} />
      </li>
      <ActionRow icon={overrideIcon} label="Back to the start view" onClick={() => siteView()?.set(HOME_VIEW)} />
      <Section label="Saved view" hint="this browser only" />
      <ActionRow icon={subIcon} label="Save this view" onClick={() => p.saveView(scene.parcel.id)} note={saved ? <span className="muted">replaces the last</span> : undefined} />
      <ActionRow icon={overrideIcon} label="Saved view" disabled={!saved} onClick={() => p.restoreView(scene.parcel.id)} />
      <Note small muted>
        Right-drag to turn, Shift + right-drag to pan, wheel to zoom. The square is the exported image.
      </Note>
    </>
  );
}

/** Look: lines or sun, and what is drawn. */
function LookTab() {
  const p = usePresentStore();
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const envelope = useEnvelope();
  const constraints = useConstraints();
  const streetSide = constraints?.streetSide?.value ?? null;
  return (
    <>
      <Section label="Drawing" />
      <SegmentRow<LookId> icon={subIcon} label="Look" value={p.style.look} onChange={p.setLook} options={(Object.keys(LOOKS) as LookId[]).map((k) => ({ value: k, text: LOOKS[k] }))} />
      <Section label="Show" />
      <ToggleRow icon={areaIcon} label="Envelope" on={showEnvelope && !!envelope} disabled={!envelope} onChange={setShowEnvelope} />
      <ToggleRow icon={setbacksIcon} label="Street name" on={p.streetLabels} onChange={(on) => p.setToggle("streetLabels", on)} note={streetSide === null ? "street side unknown" : undefined} />
      <ToggleRow icon={subIcon} label="Annotations" on={p.annotations} onChange={(on) => p.setToggle("annotations", on)} />
    </>
  );
}

type ControlTab = "camera" | "look";

/** Present, left of the model: the camera and the look of the square that is exported. */
export function PresentControls({ grid, cells, onBack }: { grid: Grid; cells: PanelCells; onBack: () => void }) {
  const [tab, setTab] = useState<ControlTab>("camera");
  const tabs: Tab<ControlTab>[] = [
    { id: "camera", label: "Camera" },
    { id: "look", label: "Look" },
  ];
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={["Present", "and export"]}
      onBack={onBack}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={[{ text: "The square " }, { text: "is the image", className: "accent" }]}
      secondary={{ label: "Start view", icon: overrideIcon, onClick: () => siteView()?.set(HOME_VIEW), title: "The landing's isometric view" }}
    >
      {tab === "camera" ? <CameraTab /> : <LookTab />}
    </PanelFrame>
  );
}

/** Present, right of the model: which option, the image's resolution, the PDF report, and what the last exports produced. */
export function PresentOutput({ grid, cells }: { grid: Grid; cells: PanelCells }) {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const hasDirections = useAiStore((s) => s.directions.status === "done");
  const [writeNarrative, setWriteNarrative] = useState(true);
  const [report, setReport] = useState<Report>({ status: "idle" });
  const ex = p.exportState;
  const side = exportSide(p.multiplier);
  const makeReport = () => {
    setReport({ status: "working", message: "Starting" });
    generateReport({ narrative: writeNarrative && hasDirections }, (message) => setReport({ status: "working", message: message.replace(/…$/, "") })).then(
      (result) => setReport({ status: "done", result }),
      (e) => setReport({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const fileName = scene ? `massing-${fileSafe(scene.parcel.id)}-option-${active}-${side}px.png` : "massing.png";

  let status: TextPart[];
  let busy = false;
  if (report.status === "working") {
    status = [{ text: report.message }];
    busy = true;
  } else if (ex.status === "rendering") {
    status = [{ text: `Rendering ${side} × ${side}` }];
    busy = true;
  } else if (report.status === "error") status = [{ text: "Report failed: ", className: "accent" }, { text: report.message }];
  else if (ex.status === "error") status = [{ text: "Export failed: ", className: "accent" }, { text: ex.message }];
  else if (report.status === "done") status = [{ text: "Report saved", className: "accent" }, { text: `, ${report.result.fileName}` }];
  else if (ex.status === "done") status = [{ text: "Image saved", className: "accent" }, { text: `, ${ex.width} × ${ex.height} px` }];
  else status = [{ text: `Option ${active}`, className: "accent" }, { text: `, ${side} × ${side} px` }];

  const working = report.status === "working" || ex.status === "rendering";
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={["Image", "and report"]}
      details={{ chip: `Option ${active}`, lines: [`${side} × ${side} px`, "Square PNG"] }}
      status={status}
      busy={busy}
      secondary={{ label: "PDF report", icon: suggestIcon, disabled: working || !scene, onClick: makeReport, title: "Renders every option and writes the report" }}
      go={{ label: "Export PNG", disabled: working || !scene, onClick: () => p.startExport(fileName) }}
    >
      <Section label="Option" hint="the one on screen" />
      <SegmentRow<OptionId> icon={subIcon} label="Option" value={active} onChange={setActive} options={OPTION_IDS.map((o) => ({ value: o, text: `Option ${o}` }))} hideTitle />
      <Section label="Image" hint="the square, as on screen" />
      <SegmentRow<Multiplier> icon={coverageIcon} label="Resolution" value={p.multiplier} onChange={p.setMultiplier} options={MULTIPLIERS.map((m) => ({ value: m, text: `${m}×` }))} />
      <ValueRow icon={areaIcon} label="Size" value={`${side} × ${side}`} note={<span className="muted">px</span>} />
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
      <Section label="Report" hint="PDF, every option" />
      <ToggleRow icon={suggestIcon} label="AI narrative" on={writeNarrative && hasDirections} disabled={!hasDirections} onChange={setWriteNarrative} note={hasDirections ? "numbers by code" : "generate first"} />
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
    </PanelFrame>
  );
}
