import { useState } from "react";
import areaIcon from "../landing/assets/rules/area.svg";
import coverageIcon from "../landing/assets/rules/coverage.svg";
import functionsIcon from "../landing/assets/rules/functions.svg";
import subIcon from "../landing/assets/rules/sub.svg";
import suggestIcon from "../landing/assets/rules/suggest.svg";
import type { Grid } from "../landing/grid";
import type { TextPart } from "../landing/ShuffleText";
import { usePresentStore } from "../state/presentStore";
import { useSiteStore } from "../state/siteStore";
import { OPTION_IDS, optionText, useMassingStore, type OptionId } from "../state/massingStore";
import { VIEW_PRESETS, siteView, type ViewPreset } from "../landing/model/siteView";
import { MULTIPLIERS, exportSide, type Multiplier } from "../present/frame";
import { generateReport } from "../report/generate";
import { PanelFrame } from "./PanelFrame";
import { PickRow, Section, SegmentRow, Segments, ToggleRow, ValueRow } from "./rows";
import type { PanelCells } from "./layout";

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What one press of Export writes. */
type Output = "png" | "pdf" | "svg" | "full";
const OUTPUTS: { id: Output; label: string; note: string; icon: string }[] = [
  { id: "png", label: "PNG", note: "as on screen", icon: areaIcon },
  { id: "pdf", label: "PDF", note: "every option", icon: functionsIcon },
  { id: "svg", label: "SVG", note: "vector lines", icon: subIcon },
  { id: "full", label: "Full report", note: "PDF + AI text", icon: suggestIcon },
];

type Run = { status: "idle" } | { status: "working"; message: string } | { status: "error"; message: string } | { status: "done"; saved: string[] };

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Export, right of the model: the option, the view, the image size and what to write; one button writes every checked file. */
export function PresentOutput({ grid, cells }: { grid: Grid; cells: PanelCells }) {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const custom = useMassingStore((s) => s.custom);
  const [outputs, setOutputs] = useState<Record<Output, boolean>>({ png: true, pdf: false, svg: false, full: false });
  const [run, setRun] = useState<Run>({ status: "idle" });
  const side = exportSide(p.multiplier);
  const presets = Object.keys(VIEW_PRESETS) as ViewPreset[];
  const chosen = OUTPUTS.filter((o) => outputs[o.id]);
  const working = run.status === "working" || p.exportState.status === "rendering";

  const exportAll = async () => {
    if (!scene) return;
    const base = `massing-${fileSafe(scene.parcel.id)}`;
    const saved: string[] = [];
    try {
      for (const o of chosen) {
        if (o.id === "png") {
          setRun({ status: "working", message: `Rendering ${side} × ${side}` });
          const r = await p.startExport(`${base}-${active}-${side}px.png`);
          if (r.status === "error") throw new Error(r.message);
          saved.push("PNG");
        } else if (o.id === "svg") {
          setRun({ status: "working", message: "Drawing the SVG" });
          const view = siteView();
          if (!view) throw new Error("The model is not ready yet.");
          download(await view.captureSvg(), `${base}-${active}.svg`);
          saved.push("SVG");
        } else {
          const full = o.id === "full";
          const r = await generateReport({ narrative: full }, (message) => setRun({ status: "working", message: message.replace(/…$/, "") }));
          if (full && r.narrative === "failed") throw new Error(`Report saved without the AI's text: ${r.narrativeError ?? "the call failed"}`);
          saved.push(full ? "Full report" : "PDF");
        }
      }
      setRun({ status: "done", saved });
    } catch (e) {
      setRun({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const status: TextPart[] | undefined =
    run.status === "working"
      ? [{ text: run.message }]
      : run.status === "error"
        ? [{ text: "Export failed: ", className: "accent" }, { text: run.message }]
        : run.status === "done"
          ? [{ text: "Saved", className: "accent" }, { text: ` ${run.saved.join(", ")}` }]
          : undefined;

  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={["Export", ""]}
      details={false}
      status={status}
      busy={run.status === "working"}
      go={{ label: "Export", disabled: working || !scene || chosen.length === 0, onClick: () => void exportAll() }}
    >
      <Section label="Option" />
      <PickRow<OptionId>
        label="Option"
        hideTitle
        value={active}
        onChange={setActive}
        options={OPTION_IDS.map((o) => ({ value: o, text: optionText(o, custom).name, disabled: o === "custom" && !custom }))}
      />
      <Section label="Views" />
      <li className="row full">
        {/* presets are actions, not states: none stays pressed */}
        <Segments<ViewPreset | ""> value="" label="Views" onChange={(k) => k && p.applyPreset(k)} options={presets.map((k) => ({ value: k, text: VIEW_PRESETS[k] }))} />
      </li>
      <Section label="Image" />
      <SegmentRow<Multiplier> icon={coverageIcon} label="Resolution" value={p.multiplier} onChange={p.setMultiplier} options={MULTIPLIERS.map((m) => ({ value: m, text: `${m}×` }))} />
      <ValueRow icon={areaIcon} label="Size" value={`${side} × ${side} px`} wide />
      <Section label="Report" />
      {OUTPUTS.map((o) => (
        <ToggleRow key={o.id} icon={o.icon} label={o.label} on={outputs[o.id]} onChange={(on) => setOutputs((s) => ({ ...s, [o.id]: on }))} note={o.note} />
      ))}
    </PanelFrame>
  );
}
