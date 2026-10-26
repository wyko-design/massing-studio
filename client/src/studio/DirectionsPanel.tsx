import { useEffect, useRef, useState } from "react";
import { PARAM_RANGES, PRIORITY_KEYS, PROGRAMME_RANGES, TEMPLATES, TYPOLOGY_LABELS, type MassingParams, type PriorityKey, type Programme, type Typology } from "@massing/shared";
import areaIcon from "../landing/assets/rules/area.svg";
import coverageIcon from "../landing/assets/rules/coverage.svg";
import farIcon from "../landing/assets/rules/far.svg";
import functionsIcon from "../landing/assets/rules/functions.svg";
import heightIcon from "../landing/assets/rules/height.svg";
import overrideIcon from "../landing/assets/rules/override.svg";
import parkingIcon from "../landing/assets/rules/parking.svg";
import setbacksIcon from "../landing/assets/rules/setbacks.svg";
import subIcon from "../landing/assets/rules/sub.svg";
import suggestIcon from "../landing/assets/rules/suggest.svg";
import type { Grid } from "../landing/grid";
import type { TextPart } from "../landing/ShuffleText";
import { useEnvelope, useSiteStore } from "../state/siteStore";
import { OPTION_IDS, useMassing, useMassingStore, type OptionId } from "../state/massingStore";
import { useAiStore, type Call } from "../state/aiStore";
import { usePresentStore } from "../state/presentStore";
import { LOOKS, type LookId } from "../viewer/renderStyle";
import { HOME_VIEW, siteView } from "../landing/model/siteView";
import { PanelFrame, type Tab } from "./PanelFrame";
import { ActionRow, CheckRow, Note, PickRow, Section, SegmentRow, SliderRow, ToggleRow, ValueRow } from "./rows";
import type { PanelCells } from "./layout";

const PRIORITY_LABELS: Record<PriorityKey, string> = { units: "Homes", daylight: "Daylight", lowProfile: "Low profile", openSpace: "Open space", simplicity: "Simplicity" };
const PROGRAMME_LABELS: Record<keyof Programme, string> = { targetUnits: "Target homes", avgUnitSize: "Avg. home size", netToGross: "Net-to-gross" };
const TYPOLOGIES = Object.keys(TYPOLOGY_LABELS) as Typology[];

/** Icons of the rules window, per compliance rule (by its label). */
const RULE_ICONS: Record<string, string> = {
  "Allowed functions": functionsIcon,
  "Max building height": heightIcon,
  "Max gutter height": heightIcon,
  "Max coverage (0–1)": coverageIcon,
  "Max FAR": farIcon,
  "Parking norm": parkingIcon,
  "Inside buildable envelope": areaIcon,
};

/** Rule names short enough for the narrow panels' title cells (the full name is in the row's tooltip detail). */
const RULE_SHORT: Record<string, string> = {
  "Allowed functions": "Functions",
  "Max building height": "Max height",
  "Max gutter height": "Max gutter",
  "Max coverage (0–1)": "Max coverage",
  "Inside buildable envelope": "In envelope",
};

const fmt = (x: number, digits = 1) => x.toFixed(digits);

/** The brief, the AI's reading of it, the priorities and the programme. "Interpret brief" is the only call here. */
function BriefTab() {
  const { brief, priorities, typologyHints, interpret, setBrief, setPriority, interpretBrief } = useAiStore();
  const programme = useMassingStore((s) => s.programme);
  const setProgramme = useMassingStore((s) => s.setProgramme);
  const r = interpret.result;
  return (
    <>
      <Section label="Brief" hint="read by the AI" />
      <li className="row text">
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. starter apartments, lots of daylight, keep it low towards the neighbours" aria-label="Brief" />
        <button type="button" className="text-action t-semimono" disabled={!brief.trim() || interpret.status === "loading"} onClick={() => void interpretBrief()}>
          {interpret.status === "loading" ? "Reading…" : "Read brief"}
          <img src={suggestIcon} alt="" width={12} height={12} />
        </button>
      </li>
      <CallNote call={interpret} />
      {r && (
        <>
          <Note white>{r.summary}</Note>
          {r.changes.length > 0 && (
            <Note small>
              <ul>
                {r.changes.map((c) => (
                  <li key={c.field}>
                    <span>
                      {PROGRAMME_LABELS[c.field as keyof Programme] ?? c.field} from <q>{c.briefQuote}</q>
                    </span>
                  </li>
                ))}
              </ul>
            </Note>
          )}
          {r.unclear.length > 0 && (
            <Note small muted>
              <ul>
                {r.unclear.map((u, i) => (
                  <li key={i}>
                    <span>Unclear: {u}</span>
                  </li>
                ))}
              </ul>
            </Note>
          )}
          {r.clamps.length > 0 && (
            <Note small>
              <ul>
                {r.clamps.map((c, i) => (
                  <li key={i}>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Note>
          )}
        </>
      )}
      <Section label="Priorities" hint="0–5, edit freely" />
      {PRIORITY_KEYS.map((k) => (
        <SliderRow key={k} icon={subIcon} label={PRIORITY_LABELS[k]} value={priorities[k]} spec={{ min: 0, max: 5, step: 1 }} onChange={(v) => setPriority(k, v)} />
      ))}
      {typologyHints.length > 0 && <Note small>Typology hints from the brief: {typologyHints.map((t) => TYPOLOGY_LABELS[t]).join(", ")}</Note>}
      <Section label="Programme" hint="assumptions" />
      {(Object.keys(PROGRAMME_RANGES) as (keyof Programme)[]).map((k) => {
        const range = PROGRAMME_RANGES[k];
        return <SliderRow key={k} icon={functionsIcon} label={PROGRAMME_LABELS[k]} value={programme[k]} spec={{ ...range, unit: range.unit }} onChange={(v) => setProgramme({ [k]: v })} />;
      })}
    </>
  );
}

/** What an AI call is doing, when it is not idle. */
function CallNote({ call }: { call: Call<unknown> }) {
  if (call.status === "error") return <Note accent>{call.error}</Note>;
  if (call.status === "done" && call.cached) return <Note small muted>Answer replayed from the offline cache.</Note>;
  return null;
}

/** The shown option's shape: typology, floors, depth, coverage, heights, orientation, roof. Sliders only, no AI. */
function ShapeTab({ id }: { id: OptionId }) {
  const p = useMassingStore((s) => s.options[id]);
  const setParams = useMassingStore((s) => s.setParams);
  const setActive = useMassingStore((s) => s.setActive);
  const resetOption = useMassingStore((s) => s.resetOption);
  const fromAi = useAiStore((s) => !!s.directions.result?.options.some((o) => o.id === id));
  const set = (patch: Partial<MassingParams>) => setParams(id, patch);
  return (
    <>
      <Section label="Option" hint="the one on screen" />
      <SegmentRow<OptionId> icon={subIcon} label="Editing" value={id} onChange={setActive} options={OPTION_IDS.map((o) => ({ value: o, text: `Option ${o}` }))} hideTitle />
      <Section label="Shape" hint="sliders only, no AI" />
      <PickRow
        icon={areaIcon}
        label="Typology"
        value={p.typology}
        onChange={(typology) => set({ typology })}
        options={TYPOLOGIES.map((t) => ({ value: t, text: TEMPLATES[t] ? TYPOLOGY_LABELS[t] : `${TYPOLOGY_LABELS[t]} (not built yet)`, disabled: !TEMPLATES[t] }))}
      />
      <SliderRow icon={heightIcon} turned label="Floors" value={p.floors} spec={PARAM_RANGES.floors} onChange={(floors) => set({ floors })} />
      <SliderRow icon={setbacksIcon} label="Depth" value={p.depth} spec={PARAM_RANGES.depth} onChange={(depth) => set({ depth })} />
      <SliderRow icon={coverageIcon} label="Coverage" value={p.coverageTarget} spec={PARAM_RANGES.coverageTarget} onChange={(coverageTarget) => set({ coverageTarget })} />
      <SliderRow icon={heightIcon} turned label="Ground floor" value={p.groundFloorHeight} spec={PARAM_RANGES.groundFloorHeight} onChange={(groundFloorHeight) => set({ groundFloorHeight })} />
      <SliderRow icon={heightIcon} turned label="Floor height" value={p.floorHeight} spec={PARAM_RANGES.floorHeight} onChange={(floorHeight) => set({ floorHeight })} />
      <SegmentRow
        icon={setbacksIcon}
        label="Alignment"
        value={p.alignment}
        onChange={(alignment) => set({ alignment })}
        options={[
          { value: "street", text: "Street" },
          { value: "sun", text: "East–west" },
        ]}
      />
      <SegmentRow
        icon={heightIcon}
        label="Roof"
        value={p.roof}
        onChange={(roof) => set({ roof })}
        options={[
          { value: "flat", text: "Flat" },
          { value: "pitched", text: "Pitched" },
        ]}
      />
      <ActionRow icon={overrideIcon} label={`Reset option ${id}`} onClick={() => resetOption(id)} note={<span className="muted">{fromAi ? "to the hand-set start" : "to the start"}</span>} />
    </>
  );
}

/** How the model is drawn: the look, the envelope, the camera back to the start. */
function ViewTab() {
  const look = usePresentStore((s) => s.style.look);
  const setLook = usePresentStore((s) => s.setLook);
  const showEnvelope = useSiteStore((s) => s.showEnvelope);
  const setShowEnvelope = useSiteStore((s) => s.setShowEnvelope);
  const envelope = useEnvelope();
  return (
    <>
      <Section label="Drawing" />
      <SegmentRow<LookId> icon={subIcon} label="Look" value={look} onChange={setLook} options={(Object.keys(LOOKS) as LookId[]).map((k) => ({ value: k, text: LOOKS[k] }))} />
      <ToggleRow icon={areaIcon} label="Envelope" on={showEnvelope && !!envelope} disabled={!envelope} onChange={setShowEnvelope} note={envelope ? "dashed, from the rules" : "rules missing"} />
      <Section label="Camera" />
      <ActionRow icon={overrideIcon} label="Back to the start view" onClick={() => siteView()?.set(HOME_VIEW)} />
      <Note small muted>
        Right-drag to turn, Shift + right-drag to pan, wheel to zoom.
      </Note>
    </>
  );
}

/** The band's label: what the directions call is doing, else what to do next. */
function useStatus(): { parts: TextPart[]; busy: boolean } {
  const directions = useAiStore((s) => s.directions);
  if (directions.status === "loading") return { parts: [{ text: "Generating three directions" }], busy: true };
  if (directions.status === "error") return { parts: [{ text: "Could not generate: ", className: "accent" }, { text: directions.error ?? "" }], busy: false };
  const warning = directions.result?.warnings[0];
  if (warning) return { parts: [{ text: "Note: ", className: "accent" }, { text: warning }], busy: false };
  if (directions.status === "done") return { parts: [{ text: "3 directions", className: "accent" }, { text: directions.cached ? " (offline cache)" : " from the AI" }], busy: false };
  return { parts: [{ text: "Brief, priorities, then " }, { text: "generate", className: "accent" }], busy: false };
}

type ControlTab = "brief" | "shape" | "view";

/** Directions, left of the model: what the user adjusts (the brief, the shown option's shape, the drawing). One AI call in the band. */
export function DirectionsControls({ grid, cells, onBack }: { grid: Grid; cells: PanelCells; onBack: () => void }) {
  const active = useMassingStore((s) => s.active);
  const directions = useAiStore((s) => s.directions.status);
  const generate = useAiStore((s) => s.generateDirections);
  const [tab, setTab] = useState<ControlTab>("brief");
  // once the AI has answered, show the shape it proposed for the option on screen
  const was = useRef(directions);
  useEffect(() => {
    if (was.current === "loading" && directions === "done") setTab("shape");
    was.current = directions;
  }, [directions]);
  const status = useStatus();
  const tabs: Tab<ControlTab>[] = [
    { id: "brief", label: "Brief" },
    { id: "shape", label: `Option ${active}` },
    { id: "view", label: "View" },
  ];
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={["Design", "directions"]}
      onBack={onBack}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={status.parts}
      busy={status.busy}
      secondary={{ label: directions === "loading" ? "Generating…" : "Generate directions", icon: suggestIcon, disabled: directions === "loading", onClick: () => void generate(), title: "The AI proposes three options from the brief and the priorities" }}
    >
      {tab === "brief" ? <BriefTab /> : tab === "shape" ? <ShapeTab id={active} /> : <ViewTab />}
    </PanelFrame>
  );
}

/** The AI's idea behind the option, when there is one. */
function DirectionNote({ id }: { id: OptionId }) {
  const p = useMassingStore((s) => s.options[id]);
  const direction = useAiStore((s) => s.directions.result?.options.find((o) => o.id === id) ?? null);
  const edited = direction ? (Object.keys(direction.params) as (keyof MassingParams)[]).some((k) => k !== "colour" && direction.params[k] !== p[k]) : false;
  if (!direction) {
    return (
      <Note small muted>
        Option {id} is a starting point. “Generate directions” lets the AI propose three, from the brief and the priorities.
      </Note>
    );
  }
  return (
    <>
      <Note white>
        <div className="name">
          <span className="chip">{id}</span>
          {direction.name}
        </div>
        {direction.intent}
      </Note>
      {direction.tradeOffs.length > 0 && (
        <Note small>
          <ul>
            {direction.tradeOffs.map((t, i) => (
              <li key={i}>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Note>
      )}
      {edited && <Note small accent>Changed by hand since the AI proposed it.</Note>}
    </>
  );
}

/** The option's parameters as set, its computed numbers (never the model's), the indicative rule check, the clamps and assumptions. */
function OptionDetails({ id }: { id: OptionId }) {
  const result = useMassing(id);
  const p = useMassingStore((s) => s.options[id]);
  const envelope = useEnvelope();
  const targetUnits = useMassingStore((s) => s.programme.targetUnits);
  if (!result || !envelope) return <Note muted>No massing yet: the site and its rules are still loading.</Note>;
  const m = result.metrics;
  return (
    <>
      <DirectionNote id={id} />
      <Section label="Parameters" hint="as set" />
      <ValueRow icon={areaIcon} label="Typology" value={TYPOLOGY_LABELS[p.typology]} />
      <ValueRow icon={heightIcon} turned label="Floors" value={p.floors} />
      <ValueRow icon={setbacksIcon} label="Depth" value={`${fmt(p.depth)} m`} />
      <ValueRow icon={coverageIcon} label="Coverage" value={fmt(p.coverageTarget, 2)} note={<span className="muted">target</span>} />
      <ValueRow icon={heightIcon} turned label="Floor heights" value={`${fmt(p.groundFloorHeight)} / ${fmt(p.floorHeight)} m`} note={<span className="muted">ground / upper</span>} />
      <ValueRow icon={setbacksIcon} label="Alignment" value={p.alignment === "street" ? "Street" : "East–west"} />
      <ValueRow icon={heightIcon} label="Roof" value={p.roof === "flat" ? "Flat" : "Pitched"} />
      <Section label="Computed" hint="by code" />
      <ValueRow icon={areaIcon} label="Footprint" value={`${fmt(m.footprint, 0)} m²`} />
      <ValueRow icon={areaIcon} label="GFA" value={`${fmt(m.gfa, 0)} m²`} note={<span className="muted">gross floor area</span>} />
      <ValueRow icon={coverageIcon} label="Coverage" value={fmt(m.coverage, 2)} />
      <ValueRow icon={farIcon} label="FAR" value={fmt(m.far, 2)} note={<span className="muted">floor area ratio</span>} />
      <ValueRow icon={heightIcon} turned label="Height" value={`${fmt(m.height)} m`} note={`${m.floors} ${m.floors === 1 ? "floor" : "floors"}`} />
      <ValueRow icon={functionsIcon} label="Homes (est.)" value={m.estUnits} note={<span className="muted">target {targetUnits}</span>} />
      <ValueRow icon={subIcon} label="Sun score" value={fmt(m.facadeSunScore, 2)} note={<span className="muted">1 = long sides face south</span>} />
      <Section label="Rules" hint="indicative" />
      {result.compliance.map((c) => (
        <CheckRow key={c.rule} icon={RULE_ICONS[c.rule]} label={RULE_SHORT[c.rule] ?? c.rule.replace(" (0–1)", "")} status={c.status} detail={c.detail} />
      ))}
      <Section label="Clamps" hint={result.clamps.length ? `${result.clamps.length}` : "none"} />
      <Note small>
        {result.clamps.length ? (
          <ul>
            {result.clamps.map((c, i) => (
              <li key={i}>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        ) : (
          "None: the option is built as asked."
        )}
      </Note>
      <Section label="Assumptions" />
      <Note small>
        <ul>
          {[...envelope.notes, ...result.assumptions].map((a, i) => (
            <li key={i}>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </Note>
      <Note small muted>
        Indicative early study. Not a permit check.
      </Note>
    </>
  );
}

/** Rules an option breaks, for its tab's count. */
function useFailing(id: OptionId): number {
  const result = useMassing(id);
  return result?.compliance.filter((c) => c.status === "fail").length ?? 0;
}

/** Directions, right of the model: the chosen option (a tab each), its parameters and how it meets the rules. The arrow goes on to Present. */
export function OptionInfo({ grid, cells, onPresent }: { grid: Grid; cells: PanelCells; onPresent: () => void }) {
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const typology = useMassingStore((s) => s.options[active].typology);
  const result = useMassing(active);
  const failing: Record<OptionId, number> = { A: useFailing("A"), B: useFailing("B"), C: useFailing("C") };
  const m = result?.metrics;
  const nowFailing = failing[active];
  const chip = !result ? "Rules unknown" : nowFailing ? `${nowFailing} ${nowFailing === 1 ? "rule" : "rules"} not met` : "Rules met";
  const lines: [string, string] = m ? [`GFA ${fmt(m.gfa, 0)} m²`, `FAR ${fmt(m.far, 2)} · ${fmt(m.height)} m`] : ["", ""];
  const status: TextPart[] = !result
    ? [{ text: "Waiting for the site and its rules" }]
    : nowFailing
      ? [{ text: `Option ${active}`, className: "accent" }, { text: `, ${nowFailing} ${nowFailing === 1 ? "rule" : "rules"} not met` }]
      : [{ text: `Option ${active}`, className: "accent" }, { text: ", no rule broken" }];
  const tabs: Tab<OptionId>[] = OPTION_IDS.map((id) => ({ id, label: `Option ${id}`, count: failing[id] || undefined }));
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={[`Option ${active}`, TYPOLOGY_LABELS[typology]]}
      details={{ chip, lines }}
      tabs={tabs}
      tab={active}
      onTab={setActive}
      status={status}
      go={{ label: "Present", onClick: onPresent, disabled: !result }}
    >
      <OptionDetails id={active} />
    </PanelFrame>
  );
}
