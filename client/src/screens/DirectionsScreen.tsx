import type { ReactNode } from "react";
import { PARAM_RANGES, PROGRAMME_RANGES, TEMPLATES, TYPOLOGY_LABELS, type Compliance, type MassingParams, type MassingResult, type Typology } from "@massing/shared";
import { useEnvelope } from "../state/siteStore";
import { OPTION_IDS, useMassing, useMassingStore, type OptionId } from "../state/massingStore";
import { useAiStore } from "../state/aiStore";
import { BriefPanel, DirectionCard } from "./AiPanels";
import { Slider, heading, label } from "./controls";
import { panel } from "./panel";

const COMPLIANCE_COLOURS: Record<Compliance["status"], { bg: string; fg: string }> = {
  pass: { bg: "#d6efd9", fg: "#185c26" },
  fail: { bg: "#f8d7da", fg: "#8a1424" },
  unknown: { bg: "#e4e4e4", fg: "#555" },
};

type Option<T> = { value: T; text: string; disabled?: boolean };

function Select<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <label style={{ ...label, gridTemplateColumns: "92px 1fr" }}>
      <span>{name}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} style={{ fontFamily: "inherit", minWidth: 0 }}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}

const TYPOLOGIES = Object.keys(TYPOLOGY_LABELS) as Typology[];

function Inputs({ id }: { id: OptionId }) {
  const programme = useMassingStore((s) => s.programme);
  const p = useMassingStore((s) => s.options[id]);
  const { setProgramme, setParams, resetOption } = useMassingStore();
  const set = (patch: Partial<MassingParams>) => setParams(id, patch);
  return (
    <>
      <h4 style={heading}>Programme (assumptions)</h4>
      <Slider name="Target units" value={programme.targetUnits} {...PROGRAMME_RANGES.targetUnits} onChange={(targetUnits) => setProgramme({ targetUnits })} />
      <Slider name="Avg unit size" value={programme.avgUnitSize} {...PROGRAMME_RANGES.avgUnitSize} unit=" m²" onChange={(avgUnitSize) => setProgramme({ avgUnitSize })} />
      <Slider name="Net-to-gross" value={programme.netToGross} {...PROGRAMME_RANGES.netToGross} onChange={(netToGross) => setProgramme({ netToGross })} />

      <h4 style={heading}>Option {id}</h4>
      <Select
        name="Typology"
        value={p.typology}
        onChange={(typology) => set({ typology })}
        options={TYPOLOGIES.map((t) => ({ value: t, text: TEMPLATES[t] ? TYPOLOGY_LABELS[t] : `${TYPOLOGY_LABELS[t]} (not built yet)`, disabled: !TEMPLATES[t] }))}
      />
      <Slider name="Floors" value={p.floors} {...PARAM_RANGES.floors} onChange={(floors) => set({ floors })} />
      <Slider name="Depth" value={p.depth} {...PARAM_RANGES.depth} unit=" m" onChange={(depth) => set({ depth })} />
      <Slider name="Coverage" value={p.coverageTarget} {...PARAM_RANGES.coverageTarget} onChange={(coverageTarget) => set({ coverageTarget })} />
      <Slider name="Ground floor" value={p.groundFloorHeight} {...PARAM_RANGES.groundFloorHeight} unit=" m" onChange={(groundFloorHeight) => set({ groundFloorHeight })} />
      <Slider name="Floor height" value={p.floorHeight} {...PARAM_RANGES.floorHeight} unit=" m" onChange={(floorHeight) => set({ floorHeight })} />
      <Select
        name="Alignment"
        value={p.alignment}
        onChange={(alignment) => set({ alignment })}
        options={[
          { value: "street", text: "To the street" },
          { value: "sun", text: "East–west (sun)" },
        ]}
      />
      <Select
        name="Roof"
        value={p.roof}
        onChange={(roof) => set({ roof })}
        options={[
          { value: "flat", text: "Flat" },
          { value: "pitched", text: "Pitched" },
        ]}
      />
      <label style={{ ...label, gridTemplateColumns: "92px 1fr" }}>
        <span>Colour</span>
        <input type="color" value={p.colour} onChange={(e) => set({ colour: e.target.value })} />
      </label>
      <button onClick={() => resetOption(id)} style={{ marginTop: 8, fontFamily: "inherit" }}>
        Reset option {id}
      </button>
    </>
  );
}

const fmt = (x: number, digits = 1) => x.toFixed(digits);

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ opacity: 0.7 }}>{name}</span>
      <span>{children}</span>
    </div>
  );
}

function Results({ result, targetUnits, envelopeNotes }: { result: MassingResult; targetUnits: number; envelopeNotes: string[] }) {
  const m = result.metrics;
  return (
    <>
      <h4 style={{ ...heading, marginTop: 0 }}>Metrics</h4>
      <Row name="Footprint">{fmt(m.footprint, 0)} m²</Row>
      <Row name="GFA">{fmt(m.gfa, 0)} m²</Row>
      <Row name="Coverage">{fmt(m.coverage, 2)}</Row>
      <Row name="FAR">{fmt(m.far, 2)}</Row>
      <Row name="Height">{fmt(m.height)} m</Row>
      <Row name="Floors">{m.floors}</Row>
      <Row name="Est. units">
        {m.estUnits} <span style={{ opacity: 0.6 }}>(target {targetUnits})</span>
      </Row>
      <Row name="Sun score">{fmt(m.facadeSunScore, 2)}</Row>

      <h4 style={heading}>Compliance (indicative)</h4>
      {result.compliance.map((c) => {
        const { bg, fg } = COMPLIANCE_COLOURS[c.status];
        return (
          <div key={c.rule} style={{ margin: "3px 0" }}>
            <span style={{ background: bg, color: fg, padding: "0 5px", borderRadius: 3, marginRight: 6 }}>{c.status}</span>
            <b>{c.rule}</b>
            <div style={{ opacity: 0.75, marginLeft: 2 }}>{c.detail}</div>
          </div>
        );
      })}

      <h4 style={heading}>Clamps</h4>
      {result.clamps.length ? (
        result.clamps.map((c, i) => (
          <div key={i} style={{ margin: "3px 0" }}>
            {c}
          </div>
        ))
      ) : (
        <div style={{ opacity: 0.6 }}>None: the option is built as asked.</div>
      )}

      <h4 style={heading}>Assumptions</h4>
      {[...envelopeNotes, ...result.assumptions].map((a, i) => (
        <div key={i} style={{ margin: "3px 0", opacity: 0.8 }}>
          {a}
        </div>
      ))}
    </>
  );
}

/** Screen 3: programme and massing inputs, option tabs, metrics. Sliders regenerate live, no AI. */
export function DirectionsScreen() {
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const targetUnits = useMassingStore((s) => s.programme.targetUnits);
  const result = useMassing(active);
  const envelope = useEnvelope();
  const names = useAiStore((s) => s.directions.result?.options);
  return (
    <>
      <div style={{ ...panel, left: 12, top: 48, display: "flex", gap: 4 }}>
        {OPTION_IDS.map((id) => (
          <button key={id} onClick={() => setActive(id)} aria-pressed={active === id} style={{ fontWeight: active === id ? 700 : 400, fontFamily: "inherit", minWidth: 56, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Option {id}
            {names?.find((o) => o.id === id) ? `: ${names.find((o) => o.id === id)!.name}` : ""}
          </button>
        ))}
      </div>
      <div style={{ ...panel, left: 12, top: 84, width: 290, maxHeight: "calc(100% - 96px)", overflowY: "auto", overflowX: "hidden" }}>
        <BriefPanel />
        <Inputs id={active} />
      </div>
      <div style={{ ...panel, right: 12, top: 12, width: 330, maxHeight: "calc(100% - 24px)", overflowY: "auto" }}>
        <DirectionCard id={active} />
        {result && envelope ? <Results result={result} targetUnits={targetUnits} envelopeNotes={envelope.notes} /> : <div>Load a site first.</div>}
        <div style={{ marginTop: 10, opacity: 0.55 }}>Indicative early study. Not a permit check.</div>
      </div>
    </>
  );
}
