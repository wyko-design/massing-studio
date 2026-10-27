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
import { OPTION_IDS, isPreset, optionText, useMassing, useMassingStore, useOptionParams, useOptionText, type OptionId } from "../state/massingStore";
import { useAiStore, type Call } from "../state/aiStore";
import { PanelFrame, type Tab } from "./PanelFrame";
import { ActionRow, CheckRow, Note, PickRow, Section, SegmentRow, SliderRow, ValueRow } from "./rows";
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
      <Section label="Brief" />
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
      <Section label="Priorities" />
      {PRIORITY_KEYS.map((k) => (
        <SliderRow key={k} icon={subIcon} label={PRIORITY_LABELS[k]} value={priorities[k]} spec={{ min: 0, max: 5, step: 1 }} onChange={(v) => setPriority(k, v)} />
      ))}
      {typologyHints.length > 0 && <Note small>Typology hints from the brief: {typologyHints.map((t) => TYPOLOGY_LABELS[t]).join(", ")}</Note>}
      <Section label="Programme" />
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

/** The option's shape: typology, floors, depth, coverage, heights, orientation, roof. Sliders only, no AI. The same rows on every tab. */
function ShapeRows({ id, params }: { id: OptionId; params: MassingParams }) {
  const setParams = useMassingStore((s) => s.setParams);
  const resetOption = useMassingStore((s) => s.resetOption);
  const p = params;
  const set = (patch: Partial<MassingParams>) => setParams(id, patch);
  return (
    <>
      <Section label="Shape" />
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
      <ActionRow icon={overrideIcon} label="Reset" onClick={() => resetOption(id)} note={<span className="muted">{isPreset(id) ? "to the preset" : "to the AI's proposal"}</span>} />
    </>
  );
}

/** A preset tab: its idea in one line, then the sliders. */
function PresetTab({ id }: { id: OptionId }) {
  const option = useOptionParams(id);
  const text = useOptionText(id);
  if (!option) return null;
  return (
    <>
      <Note white>{text.intent}</Note>
      <ShapeRows id={id} params={option.params} />
    </>
  );
}

/** Custom: the brief until the AI has proposed an option, then that option's sliders (and a way to delete it and start again). */
function CustomTab() {
  const option = useOptionParams("custom");
  const text = useOptionText("custom");
  const deleteCustom = useAiStore((s) => s.deleteCustom);
  if (!option) return <BriefTab />;
  return (
    <>
      <Note white>
        <span className="accent">{text.name}</span>, proposed by the AI from the brief.
      </Note>
      <ShapeRows id="custom" params={option.params} />
      <ActionRow icon={overrideIcon} label="Delete option" onClick={deleteCustom} note={<span className="muted">back to the brief</span>} />
    </>
  );
}

/** The band's label, on Custom before an option exists: what the call is doing, else what to do. Null = no band (presets, an existing option). */
function useStatus(id: OptionId): { parts: TextPart[]; busy: boolean } | null {
  const directions = useAiStore((s) => s.directions);
  const option = useOptionParams(id);
  if (isPreset(id) || option) return null;
  if (directions.status === "loading") return { parts: [{ text: "Generating an option from the brief" }], busy: true };
  if (directions.status === "error") return { parts: [{ text: "Could not generate: ", className: "accent" }, { text: directions.error ?? "" }], busy: false };
  return { parts: [{ text: "Brief, priorities, then " }, { text: "generate", className: "accent" }], busy: false };
}

/** Directions, left of the model: a tab per option (the four presets and Custom), each with the same shape sliders. The AI call is on Custom only. */
export function DirectionsControls({ grid, cells, onBack }: { grid: Grid; cells: PanelCells; onBack: () => void }) {
  const active = useMassingStore((s) => s.active);
  const setActive = useMassingStore((s) => s.setActive);
  const custom = useMassingStore((s) => s.custom);
  const directions = useAiStore((s) => s.directions.status);
  const generate = useAiStore((s) => s.generateDirections);
  const status = useStatus(active);
  const tabs: Tab<OptionId>[] = OPTION_IDS.map((id) => (isPreset(id) ? { id, label: optionText(id, custom).name } : { id, label: "Your brief" }));
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={["Design", "directions"]}
      onBack={onBack}
      tabs={tabs}
      tab={active}
      onTab={setActive}
      status={status?.parts}
      busy={status?.busy}
      secondary={
        status
          ? { label: directions === "loading" ? "Generating…" : "Generate option", icon: suggestIcon, disabled: directions === "loading", onClick: () => void generate(), title: "The AI proposes one option from the brief and the priorities" }
          : undefined
      }
    >
      {active === "custom" ? <CustomTab /> : <PresetTab id={active} />}
    </PanelFrame>
  );
}

/** What the option gives up (the preset's words, or the AI's), and whether the user changed it. */
function DirectionNote({ id, edited }: { id: OptionId; edited: boolean }) {
  const text = useOptionText(id);
  return (
    <>
      {text.tradeOffs.length > 0 && (
        <Note small>
          <ul>
            {text.tradeOffs.map((t, i) => (
              <li key={i}>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Note>
      )}
      {edited && <Note small accent>Changed by hand since {isPreset(id) ? "the preset" : "the AI proposed it"}.</Note>}
    </>
  );
}

/** The option's computed numbers (never the model's) and the rule check. */
function OptionDetails({ id }: { id: OptionId }) {
  const result = useMassing(id);
  const option = useOptionParams(id);
  const targetUnits = useMassingStore((s) => s.programme.targetUnits);
  if (!option)
    return (
      <Note small muted>
        No option yet. Write a brief and set the priorities on the Your brief tab, then “Generate option”.
      </Note>
    );
  if (!result) return <Note muted>No massing yet: the site and its rules are still loading.</Note>;
  const m = result.metrics;
  return (
    <>
      <DirectionNote id={id} edited={option.edited} />
      <Section label="Parameters" />
      <ValueRow icon={areaIcon} label="Footprint" value={`${fmt(m.footprint, 0)} m²`} />
      <ValueRow icon={areaIcon} label="GFA" value={`${fmt(m.gfa, 0)} m²`} note={<span className="muted">gross floor area</span>} />
      <ValueRow icon={coverageIcon} label="Coverage" value={fmt(m.coverage, 2)} />
      <ValueRow icon={farIcon} label="FAR" value={fmt(m.far, 2)} note={<span className="muted">floor area ratio</span>} />
      <ValueRow icon={heightIcon} turned label="Height" value={`${fmt(m.height)} m`} note={`${m.floors} ${m.floors === 1 ? "floor" : "floors"}`} />
      <ValueRow icon={functionsIcon} label="Homes (est.)" value={m.estUnits} note={<span className="muted">target {targetUnits}</span>} />
      <ValueRow icon={subIcon} label="Sun score" value={fmt(m.facadeSunScore, 2)} note={<span className="muted">1 = long sides face south</span>} />
      <Section label="Rules" />
      {result.compliance.map((c) => (
        <CheckRow key={c.rule} icon={RULE_ICONS[c.rule]} label={RULE_SHORT[c.rule] ?? c.rule.replace(" (0–1)", "")} status={c.status} detail={c.detail} />
      ))}
    </>
  );
}

/** A name over the header's two lines: the first word, then the rest. */
const twoLines = (name: string): [string, string] => {
  const [first = "", ...rest] = name.split(" ");
  return [first, rest.join(" ")];
};

/** Directions, right of the model: the option picked on the left, its numbers and how it meets the rules. The arrow goes on to Present. */
export function OptionInfo({ grid, cells, onPresent }: { grid: Grid; cells: PanelCells; onPresent: () => void }) {
  const active = useMassingStore((s) => s.active);
  const text = useOptionText(active);
  const result = useMassing(active);
  const failing = result?.compliance.filter((c) => c.status === "fail").length ?? 0;
  const chip = !result ? "Rules unknown" : failing ? `${failing} ${failing === 1 ? "rule" : "rules"} not met` : "Rules met";
  return (
    <PanelFrame
      grid={grid}
      panel={cells.panel}
      band={cells.band}
      heading={twoLines(text.name)}
      details={{ chip, lines: ["", ""] }}
      go={{ label: "Export", onClick: onPresent, disabled: !result }}
    >
      <OptionDetails id={active} />
    </PanelFrame>
  );
}
