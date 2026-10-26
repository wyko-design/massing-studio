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
import { useEnvelope } from "../state/siteStore";
import { useMassing, useMassingStore, type OptionId } from "../state/massingStore";
import { useAiStore, type Call } from "../state/aiStore";
import { PanelFrame, type Tab } from "./PanelFrame";
import { ActionRow, CheckRow, Note, PickRow, Section, SegmentRow, SliderRow, ValueRow } from "./rows";
import type { StudioLayout } from "./layout";

type TabId = "brief" | "option" | "check";

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

/** The AI's idea behind the option (when there is one), then its shape: typology, floors, depth, coverage, heights, orientation, roof. */
function OptionTab({ id }: { id: OptionId }) {
  const p = useMassingStore((s) => s.options[id]);
  const setParams = useMassingStore((s) => s.setParams);
  const resetOption = useMassingStore((s) => s.resetOption);
  const direction = useAiStore((s) => s.directions.result?.options.find((o) => o.id === id) ?? null);
  const set = (patch: Partial<MassingParams>) => setParams(id, patch);
  const edited = direction ? (Object.keys(direction.params) as (keyof MassingParams)[]).some((k) => k !== "colour" && direction.params[k] !== p[k]) : false;
  return (
    <>
      {direction ? (
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
      ) : (
        <Note small muted>
          Option {id} is a starting point. “Generate directions” lets the AI propose three, from the brief and the priorities.
        </Note>
      )}
      <Section label={`Option ${id}`} hint="sliders only, no AI" />
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
          { value: "street", text: "To the street" },
          { value: "sun", text: "East–west (sun)" },
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
      <ActionRow icon={overrideIcon} label={`Reset option ${id}`} onClick={() => resetOption(id)} note={<span className="muted">{direction ? "back to the hand-set start, not the AI's" : "back to the hand-set start"}</span>} />
    </>
  );
}

/** Computed numbers (never the model's), the indicative rule check, the clamps and the assumptions behind them. */
function CheckTab({ id }: { id: OptionId }) {
  const result = useMassing(id);
  const envelope = useEnvelope();
  const targetUnits = useMassingStore((s) => s.programme.targetUnits);
  if (!result || !envelope) return <Note muted>No massing yet: the site and its rules are still loading.</Note>;
  const m = result.metrics;
  return (
    <>
      <Section label={`Option ${id}`} hint="computed" />
      <ValueRow icon={areaIcon} label="Footprint" value={`${fmt(m.footprint, 0)} m²`} />
      <ValueRow icon={areaIcon} label="Gross floor area" value={`${fmt(m.gfa, 0)} m²`} />
      <ValueRow icon={coverageIcon} label="Coverage" value={fmt(m.coverage, 2)} />
      <ValueRow icon={farIcon} label="Floor area ratio" value={fmt(m.far, 2)} />
      <ValueRow icon={heightIcon} turned label="Height" value={`${fmt(m.height)} m`} note={`${m.floors} ${m.floors === 1 ? "floor" : "floors"}`} />
      <ValueRow icon={functionsIcon} label="Homes (est.)" value={m.estUnits} note={<span className="muted">target {targetUnits}</span>} />
      <ValueRow icon={subIcon} label="Sun score" value={fmt(m.facadeSunScore, 2)} note={<span className="muted">1 = the long façades face south</span>} />
      <Section label="Rules" hint="indicative, not a permit check" />
      {result.compliance.map((c) => (
        <CheckRow key={c.rule} icon={RULE_ICONS[c.rule]} label={c.rule.replace(" (0–1)", "")} status={c.status} detail={c.detail} />
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

/** The band's label: what the directions call is doing, else how many rules the shown option breaks. */
function useStatus(failing: number): { parts: TextPart[]; busy: boolean } {
  const directions = useAiStore((s) => s.directions);
  if (directions.status === "loading") return { parts: [{ text: "Generating three directions" }], busy: true };
  if (directions.status === "error") return { parts: [{ text: "Could not generate: ", className: "accent" }, { text: directions.error ?? "" }], busy: false };
  const warning = directions.result?.warnings[0];
  if (warning) return { parts: [{ text: "Note: ", className: "accent" }, { text: warning }], busy: false };
  if (failing > 0) return { parts: [{ text: `${failing} ${failing === 1 ? "rule" : "rules"}`, className: "accent" }, { text: " not met, see Check" }], busy: false };
  if (directions.status === "done") return { parts: [{ text: "3 directions", className: "accent" }, { text: directions.cached ? " (from the offline cache)" : " from the AI" }], busy: false };
  return { parts: [{ text: "Brief, priorities, then " }, { text: "generate", className: "accent" }], busy: false };
}

/** Directions: brief and priorities, the shown option's shape, its numbers. Sliders regenerate live; three buttons call the AI. */
export function DirectionsPanel({ grid, layout, onBack, onPresent }: { grid: Grid; layout: StudioLayout; onBack: () => void; onPresent: () => void }) {
  const active = useMassingStore((s) => s.active);
  const result = useMassing(active);
  const directions = useAiStore((s) => s.directions.status);
  const generate = useAiStore((s) => s.generateDirections);
  const [tab, setTab] = useState<TabId>("brief");
  // once the AI has answered, show what it proposed for the option on screen
  const was = useRef(directions);
  useEffect(() => {
    if (was.current === "loading" && directions === "done") setTab("option");
    was.current = directions;
  }, [directions]);
  const failing = result?.compliance.filter((c) => c.status === "fail").length ?? 0;
  const status = useStatus(failing);
  const tabs: Tab<TabId>[] = [
    { id: "brief", label: "Brief" },
    { id: "option", label: `Option ${active}` },
    { id: "check", label: "Check", count: failing || undefined },
  ];
  return (
    <PanelFrame
      grid={grid}
      panel={layout.panel}
      band={layout.panelBand}
      heading={["Design", "directions"]}
      onBack={onBack}
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      status={status.parts}
      busy={status.busy}
      secondary={{ label: directions === "loading" ? "Generating…" : "Generate directions", icon: suggestIcon, disabled: directions === "loading", onClick: () => void generate(), title: "The AI proposes three options from the brief and the priorities" }}
      go={{ label: "Present", onClick: onPresent, disabled: !result }}
    >
      {tab === "brief" ? <BriefTab /> : tab === "option" ? <OptionTab id={active} /> : <CheckTab id={active} />}
    </PanelFrame>
  );
}
