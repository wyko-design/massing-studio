import { useState, type ReactNode } from "react";
import { isoParts, zonedIso } from "@massing/shared";
import { usePresentStore } from "../state/presentStore";
import { useConstraints, useSiteStore } from "../state/siteStore";
import { OPTION_IDS, useMassing, useMassingStore, type OptionId } from "../state/massingStore";
import { useAiStore } from "../state/aiStore";
import { PRESETS, focusOf, type Preset } from "../present/camera";
import { ASPECTS, MULTIPLIERS, exportSize, type Aspect, type Multiplier } from "../present/frame";
import { CONTEXT_STYLES, type ContextStyle } from "../viewer/renderStyle";
import { generateReport, type ReportResult } from "../report/generate";
import { Slider, heading, label } from "./controls";
import { panel } from "./panel";

/** The sun is computed for wall-clock time at the site (NL implementation). */
const SITE_TIME_ZONE = "Europe/Amsterdam";

const row = { ...label, gridTemplateColumns: "92px 1fr" };
const buttons = { display: "flex", flexWrap: "wrap", gap: 4, margin: "3px 0" } as const;
const btn = { fontFamily: "inherit" };

function Toggle({ name, checked, onChange, disabled, note }: { name: string; checked: boolean; onChange?: (on: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", margin: "3px 0", opacity: disabled ? 0.5 : 1 }} title={note}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>
        {name}
        {note && <span style={{ opacity: 0.6 }}> ({note})</span>}
      </span>
    </label>
  );
}

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; text: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div style={buttons}>
      {options.map((o) => (
        <button key={String(o.value)} style={{ ...btn, fontWeight: value === o.value ? 700 : 400 }} aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeOf = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Screen 4: camera presets, render settings, labels and PNG export (SPEC §9–10). */
export function PresentScreen() {
  const p = usePresentStore();
  const scene = useSiteStore((s) => s.scene);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const constraints = useConstraints();
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const colour = useMassingStore((s) => s.options[active].colour);
  const setParams = useMassingStore((s) => s.setParams);
  const names = useAiStore((s) => s.directions.result?.options);
  const massing = useMassing(active);
  const hasDirections = useAiStore((s) => s.directions.status === "done");
  const [writeNarrative, setWriteNarrative] = useState(true);
  const [report, setReport] = useState<{ status: "idle" } | { status: "working"; message: string } | { status: "error"; message: string } | { status: "done"; result: ReportResult }>({ status: "idle" });
  const makeReport = () => {
    setReport({ status: "working", message: "Starting…" });
    generateReport({ narrative: writeNarrative && hasDirections }, (message) => setReport({ status: "working", message })).then(
      (result) => setReport({ status: "done", result }),
      (e) => setReport({ status: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  };

  if (!scene) return <div style={{ ...panel, left: 12, top: 48 }}>Load a site first.</div>;

  const streetSide = constraints?.streetSide?.value ?? null;
  const focus = focusOf(scene.parcel.ring, massing?.volumes);
  const { date, time } = isoParts(p.style.light.date);
  const setSun = (d: string, t: string) => p.setStyle("light", { date: zonedIso(d, t, SITE_TIME_ZONE) });
  const saved = p.savedViews[scene.parcel.id];
  const size = exportSize(p.aspect, p.multiplier);
  const ex = p.exportState;
  const fileName = `massing-${fileSafe(scene.parcel.id)}-option-${active}-${fileSafe(p.aspect)}-${p.multiplier}x.png`;

  return (
    <div style={{ ...panel, left: 12, top: 48, width: 290, maxHeight: "calc(100% - 60px)", overflowY: "auto", overflowX: "hidden" }}>
      <h4 style={{ ...heading, marginTop: 4 }}>Option shown</h4>
      <Choice<OptionId>
        value={active}
        onChange={setActive}
        options={OPTION_IDS.map((id) => ({ value: id, text: `${id}${names?.find((o) => o.id === id) ? `: ${names.find((o) => o.id === id)!.name}` : ""}` }))}
      />

      <h4 style={heading}>Camera</h4>
      <div style={buttons}>
        {(Object.keys(PRESETS) as Preset[]).map((key) => (
          <button key={key} style={btn} onClick={() => p.applyPreset(key, focus, streetSide)}>
            {PRESETS[key]}
          </button>
        ))}
      </div>
      <div style={buttons}>
        <button style={btn} onClick={() => p.saveView(scene.parcel.id)}>
          Save view
        </button>
        <button style={btn} disabled={!saved} onClick={() => p.restoreView(scene.parcel.id)}>
          Restore saved view
        </button>
      </div>
      <Choice
        value={p.projection}
        onChange={p.switchProjection}
        options={[
          { value: "ortho", text: "Axonometric" },
          { value: "perspective", text: "Perspective" },
        ]}
      />

      <h4 style={heading}>Sun</h4>
      <label style={row}>
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => e.target.value && setSun(e.target.value, time)} style={{ fontFamily: "inherit" }} />
      </label>
      <Slider name="Time (local)" value={minutesOf(time)} min={300} max={1320} step={15} format={timeOf} onChange={(m) => setSun(date, timeOf(m))} />
      <Slider name="Softness" value={p.style.light.shadowSoftness} min={1} max={16} step={1} onChange={(shadowSoftness) => p.setStyle("light", { shadowSoftness })} />

      <h4 style={heading}>Look</h4>
      <Toggle name="Ambient occlusion" checked={p.style.ao.enabled} onChange={(enabled) => p.setStyle("ao", { enabled })} />
      <Slider name="Outline" value={p.style.proposal.outlineWidth} min={0} max={6} step={0.5} unit=" px" onChange={(outlineWidth) => p.setStyle("proposal", { outlineWidth })} />
      <label style={row}>
        <span>Proposal</span>
        <input type="color" value={colour} onChange={(e) => setParams(active, { colour: e.target.value })} />
      </label>
      <label style={row}>
        <span>Context</span>
        <select value={p.style.context.style} onChange={(e) => p.setStyle("context", { style: e.target.value as ContextStyle })} style={{ fontFamily: "inherit" }}>
          {(Object.keys(CONTEXT_STYLES) as ContextStyle[]).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          <option disabled>hatched (P11)</option>
        </select>
      </label>

      <h4 style={heading}>Show</h4>
      <Toggle name="Street labels" checked={p.streetLabels} onChange={(on) => p.setToggle("streetLabels", on)} note={streetSide === null ? "street side unknown" : undefined} />
      <Toggle name="Annotations" checked={p.annotations} onChange={(on) => p.setToggle("annotations", on)} />
      <Toggle name="Envelope ghost" checked={showEnvelope} onChange={setShowEnvelope} />
      <Toggle name="Scale figures" checked={false} disabled note="P11" />
      <Toggle name="Trees" checked={false} disabled note="P11" />

      <h4 style={heading}>Output</h4>
      <Choice<Aspect> value={p.aspect} onChange={p.setAspect} options={(Object.keys(ASPECTS) as Aspect[]).map((a) => ({ value: a, text: ASPECTS[a].label }))} />
      <Choice<Multiplier> value={p.multiplier} onChange={p.setMultiplier} options={MULTIPLIERS.map((m) => ({ value: m, text: `${m}×` }))} />
      <div style={{ opacity: 0.7 }}>
        {size.width} × {size.height} px
      </div>
      <button style={{ ...btn, marginTop: 6, fontWeight: 700 }} disabled={ex.status === "rendering"} onClick={() => p.startExport(fileName)}>
        {ex.status === "rendering" ? "Rendering…" : "Export PNG"}
      </button>
      {ex.status === "done" && (
        <div style={{ marginTop: 4 }}>
          Saved {ex.fileName} ({ex.width} × {ex.height} px, {(ex.bytes / 1e6).toFixed(1)} MB, {(ex.ms / 1000).toFixed(1)} s).{" "}
          <a href={ex.url} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      )}
      {ex.status === "error" && <div style={{ marginTop: 4, color: "#8a1424" }}>{ex.message}</div>}

      <h4 style={heading}>PDF report</h4>
      <Toggle name="Write narrative with AI" checked={writeNarrative && hasDirections} disabled={!hasDirections} onChange={setWriteNarrative} note={hasDirections ? undefined : "generate directions first"} />
      <button style={{ ...btn, fontWeight: 700 }} disabled={report.status === "working" || ex.status === "rendering"} onClick={makeReport}>
        {report.status === "working" ? report.message : "Export PDF report"}
      </button>
      {report.status === "done" && (
        <div style={{ marginTop: 4 }}>
          Saved {report.result.fileName} ({(report.result.bytes / 1e6).toFixed(1)} MB).{" "}
          <a href={report.result.url} target="_blank" rel="noreferrer">
            Open
          </a>
          {report.result.narrative === "failed" && <div style={{ color: "#8a1424" }}>No narrative: {report.result.narrativeError}</div>}
          {report.result.narrative === "cached" && <div style={{ opacity: 0.7 }}>Narrative replayed from the cache.</div>}
        </div>
      )}
      {report.status === "error" && <div style={{ marginTop: 4, color: "#8a1424" }}>{report.message}</div>}
      <div style={{ marginTop: 10, opacity: 0.55 }}>Indicative early study. Not a permit check.</div>
    </div>
  );
}
