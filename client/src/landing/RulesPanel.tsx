import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CONSTRAINT_FIELDS,
  FUNCTION_OPTIONS,
  getField,
  polygonWithHolesArea,
  unknownConstraints,
  type ConstraintField,
  type FieldPath,
  type Overrides,
  type SiteConstraints,
} from "@massing/shared";
import arrowUrl from "./assets/arrow.svg";
import areaIcon from "./assets/rules/area.svg";
import checkIcon from "./assets/rules/check.svg";
import coverageIcon from "./assets/rules/coverage.svg";
import externalIcon from "./assets/rules/external.svg";
import farIcon from "./assets/rules/far.svg";
import functionsIcon from "./assets/rules/functions.svg";
import heightIcon from "./assets/rules/height.svg";
import overrideIcon from "./assets/rules/override.svg";
import parkingIcon from "./assets/rules/parking.svg";
import minusIcon from "./assets/rules/minus.svg";
import plusIcon from "./assets/rules/plus.svg";
import setbacksIcon from "./assets/rules/setbacks.svg";
import subIcon from "./assets/rules/sub.svg";
import suggestIcon from "./assets/rules/suggest.svg";
import unknownIcon from "./assets/rules/unknown.svg";
import { boxStyle, type BoxStyle, type Cells, type Grid } from "./grid";
import { ShuffleText } from "./ShuffleText";
import { useLandingStore } from "./landingStore";
import { shortAddress } from "./geoApi";
import type { PlotData } from "./globe/plotLayer";
import { useConstraints, useSiteStore } from "../state/siteStore";

/** Gap between the label's 12 px line box and the button's top border (same as the input label). */
const LABEL_GAP = 4;
const LABEL_LINE = 12;

/** Range, step and stand-in value per number field. The text box takes the value as shown (coverage as a 0–1 ratio). */
type NumberSpec = { min: number; max: number; step: number; placeholder: number; unit: string };

const NUMBER_SPECS: Partial<Record<FieldPath, NumberSpec>> = {
  maxHeight: { min: 0, max: 60, step: 0.5, placeholder: 12, unit: "m" },
  maxGutterHeight: { min: 0, max: 40, step: 0.5, placeholder: 9, unit: "m" },
  "setbacks.street": { min: 0, max: 20, step: 0.5, placeholder: 3, unit: "m" },
  "setbacks.side": { min: 0, max: 20, step: 0.5, placeholder: 2, unit: "m" },
  "setbacks.rear": { min: 0, max: 20, step: 0.5, placeholder: 4, unit: "m" },
  streetSide: { min: 0, max: 359, step: 1, placeholder: 180, unit: "°" },
  maxCoverage: { min: 0, max: 1, step: 0.05, placeholder: 0.6, unit: "" },
  maxFAR: { min: 0, max: 6, step: 0.1, placeholder: 1.5, unit: "" },
  parkingNorm: { min: 0, max: 3, step: 0.05, placeholder: 1, unit: "" },
};

const LIST_PLACEHOLDER = ["residential"];

const LABELS: Partial<Record<FieldPath, string>> = {
  allowedFunctions: "Allowed functions",
  bouwvlak: "Max. buildable area",
  maxCoverage: "Max. coverage",
  maxFAR: "Max. floor area ratio",
  maxHeight: "Max. building height",
  parkingNorm: "Parking norm",
  "setbacks.street": "Street",
  "setbacks.side": "Side",
  "setbacks.rear": "Rear",
  maxGutterHeight: "Max. gutter height",
  streetSide: "Street side",
};

const ICONS: Partial<Record<FieldPath, string>> = {
  allowedFunctions: functionsIcon,
  bouwvlak: areaIcon,
  maxCoverage: coverageIcon,
  maxFAR: farIcon,
  maxHeight: heightIcon,
  parkingNorm: parkingIcon,
  "setbacks.street": subIcon,
  "setbacks.side": subIcon,
  "setbacks.rear": subIcon,
  maxGutterHeight: heightIcon,
  streetSide: setbacksIcon,
};

const MAIN: FieldPath[] = ["allowedFunctions", "bouwvlak", "maxCoverage", "maxFAR", "maxHeight", "parkingNorm"];
const SETBACKS: FieldPath[] = ["setbacks.street", "setbacks.side", "setbacks.rear"];
const MORE: FieldPath[] = ["maxGutterHeight", "streetSide"];

type State = "known" | "unknown";

/** Fields the user can still fill in by hand (numbers and lists; the plan's polygons and lines cannot be typed). */
const isInput = (f: ConstraintField) => f.kind === "number" || f.kind === "list";

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

const STATE_WORDS: Record<State, string> = { known: "KNOWN", unknown: "UNKNOWN" };

/** The plot chip of the header: parcel number and area (the landing's plot, else the loaded scene's parcel). */
function plotChip(plot: PlotData | null, parcel: { id: string; areaM2: number } | null): string {
  const source = plot ? plot.parcel : parcel;
  if (!source) return plot ? "Plot # unknown" : "Plot";
  const number = source.id.split(" ").pop() || "unknown";
  const area = source.areaM2;
  return `Plot #${number} · ${area === null ? "area unknown" : `${Math.round(area)}m²`}`;
}

/**
 * What the header of the rules window (and of the studio's panels) shows about the site: the plot chip, and the address
 * as two lines ("Jan de Oudeweg 162" and "2628 SJ Delft, NL"; the second never breaks). From the landing's choices, or,
 * when the studio was opened directly, from the loaded scene.
 */
export function useSiteHeader(): { chip: string; street: string; place: string } {
  const address = useLandingStore((s) => s.address);
  const city = useLandingStore((s) => s.city);
  const plot = useLandingStore((s) => s.plot);
  const parcel = useSiteStore((s) => s.scene?.parcel ?? null);
  const sceneAddress = useSiteStore((s) => s.address);
  const label = address?.label ?? sceneAddress;
  const short = label ? shortAddress(label) : "";
  const post = /, (\d{4}) ?([A-Z]{2})$/.exec(short);
  const street = post ? short.slice(0, post.index) : short;
  const place = [post ? `${post[1]} ${post[2]}` : "", [city?.name, city?.cc].filter(Boolean).join(", ")].filter(Boolean).join(" ");
  return { chip: plotChip(plot, parcel), street, place };
}

/** `suggested`: filled by "Fill with suggested values", not yet typed or read from a plan. */
type Info = { value: unknown; state: State; overridden: boolean; suggested: boolean };

/** What the panel needs to know about one constraint: its value, how sure it is, and whether the user set it. */
function useInfo(path: FieldPath, constraints: SiteConstraints): Info {
  const overridden = useSiteStore((s) => path in s.overrides);
  const suggested = useSiteStore((s) => s.placeholders.includes(path));
  const c = getField(constraints, path);
  const value = c?.value ?? null;
  const state: State = value === null ? "unknown" : "known";
  return { value, state, overridden, suggested: suggested && value !== null };
}

type Source = { label: string; href?: string; missing?: boolean; reset?: () => void };

function useSource(path: FieldPath, info: Info): Source {
  const scene = useSiteStore((s) => s.scene);
  const clearOverride = useSiteStore((s) => s.clearOverride);
  if (info.value === null) return { label: "Missing", missing: true };
  if (info.suggested) return { label: "Suggested", reset: () => clearOverride(path) };
  if (info.overridden) return { label: "User input", reset: () => clearOverride(path) };
  if (path === "parkingNorm" && scene?.parking) return { label: "Policy", href: scene.parking.regulation.url };
  return { label: "Zoning plan", href: scene?.zoning?.textRefs?.[0]?.url };
}

/**
 * The reveal. The window grows, and its value, tag and source cells shimmer, empty, for SHIMMER_MS. Then the header, the bottom
 * band and the left column of the table (titles, icons) fade in slowly while those cells keep shimmering. After a pause, and once
 * the plan data is in, the rows take their turn one after the other: `n` is the number of rows whose turn has come. A row is
 * "wait" (shimmering, empty) before its turn, "resolve" while its text unscrambles into its final form, "done" once the real
 * cells are back.
 */
type Phase = "wait" | "resolve" | "done";
const STAGGER_MS = 150;
/** Ticks a resolving row needs before the real cells take over (the sweep lasts 400 ms, plus a little). */
const RESOLVE_TICKS = Math.ceil(500 / STAGGER_MS);
/** Rows of the table (titles, values, tags, sources). */
const STAGES = 12;
/** The window grows for 600 ms (landing.css, rules-grow); the empty table shimmers until this moment (growth included). */
const SHIMMER_MS = 2000;
/** The slow fade of the header, the band and the left column (landing.css, .rules-grow transitions). */
const FADE_MS = 800;
/** From the start of that fade to the first row's turn: twice the fade, so there is a pause between the labels and the data. */
const ROWS_AFTER_MS = 2 * FADE_MS;

const StageContext = createContext(Number.POSITIVE_INFINITY);

const phaseOf = (n: number, idx: number): Phase => (idx < n - RESOLVE_TICKS ? "done" : idx < n ? "resolve" : "wait");

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the table shows until the plan data is in: every value unknown. */
const LOADING = unknownConstraints("loading");

function SourceCell({ source, phase }: { source: Source; phase: Phase }) {
  // waiting: an empty, shimmering cell
  if (phase === "wait") return <div className="rules-cell rules-source shimmer" />;
  let value: ReactNode;
  if (phase === "resolve") {
    value = (
      <span className={source.missing ? "src-missing" : undefined}>
        <ShuffleText parts={[{ text: source.missing ? `${source.label}!` : source.label }]} />
      </span>
    );
  } else if (source.missing) {
    value = (
      <span className="src-missing" title="Not found in the plan data">
        {source.label}!
      </span>
    );
  } else if (source.href) {
    value = (
      <a className="src-link" href={source.href} target="_blank" rel="noreferrer">
        {source.label}
        <img src={externalIcon} alt="" width={12} height={12} />
      </a>
    );
  } else if (source.reset) {
    value = (
      <button type="button" className="src-reset" title="Reset to the plan value" onClick={source.reset}>
        {source.label}
        <img src={overrideIcon} alt="" width={10} height={10} />
      </button>
    );
  } else {
    value = <span>{source.label}</span>;
  }
  return (
    <div className="rules-cell rules-source t-semimono">
      <span className="src-label">Source:</span>
      {value}
    </div>
  );
}

function Tag({ state, phase }: { state: State; phase: Phase }) {
  if (phase === "resolve") {
    return (
      <span className={`rules-tag ${state}`}>
        <ShuffleText parts={[{ text: STATE_WORDS[state] }]} />
      </span>
    );
  }
  return (
    <span className={`rules-tag ${state}`}>
      {STATE_WORDS[state]}
      {state === "known" && <img src={checkIcon} alt="" width={12} height={12} />}
      {state === "unknown" && <img src={unknownIcon} alt="" width={12} height={12} />}
    </span>
  );
}

/** One table row: title, value cell, status tag, source. `idx` is its place in the reveal; `valueText` is what the value cell scrambles. */
function Item({
  idx,
  icon,
  label,
  sub,
  tall,
  value,
  valueText,
  state,
  source,
  turned,
  onRemove,
}: {
  idx: number;
  icon: string;
  label: string;
  sub?: boolean;
  tall?: boolean;
  value: ReactNode;
  valueText: string;
  state: State;
  source: Source;
  turned?: boolean;
  /** An optional limit that was added: its title turns into a button that takes the row away again. */
  onRemove?: () => void;
}) {
  const phase = phaseOf(useContext(StageContext), idx);
  return (
    <li className={`rules-item${sub ? " sub" : ""}${tall ? " tall" : ""}`}>
      {onRemove ? (
        <button type="button" className="rules-cell rules-title removable t-semimono" title="Remove this limit" aria-label={`Remove ${label}`} onClick={onRemove}>
          <img className="icon-idle" src={icon} alt="" width={12} height={12} style={turned ? { transform: "rotate(90deg)" } : undefined} />
          <img className="icon-minus" src={minusIcon} alt="" width={12} height={12} />
          <span>{label}</span>
        </button>
      ) : (
        <div className="rules-cell rules-title t-semimono">
          <img src={icon} alt="" width={12} height={12} style={turned ? { transform: "rotate(90deg)" } : undefined} />
          <span>{label}</span>
        </div>
      )}
      <div className={`rules-cell rules-value${phase === "wait" ? " shimmer" : ""}`}>
        {phase === "done" ? (
          value
        ) : phase === "resolve" ? (
          <span className={`rules-num t-semimono ${state}`}>
            <ShuffleText parts={[{ text: valueText }]} />
          </span>
        ) : null}
      </div>
      <div className={`rules-cell rules-status${phase === "wait" ? " shimmer" : ""}`}>{phase !== "wait" && <Tag state={state} phase={phase} />}</div>
      <SourceCell source={source} phase={phase} />
    </li>
  );
}

/** An optional limit that is not added yet: a click adds it. Its cells shimmer with the others and show [...] on their row's turn. */
function OptionalRow({ idx, label, onAdd }: { idx: number; label: string; onAdd: () => void }) {
  const phase = phaseOf(useContext(StageContext), idx);
  const wait = phase === "wait";
  return (
    <li className="rules-item more">
      <button type="button" className="rules-cell rules-title t-semimono" onClick={onAdd}>
        <img src={plusIcon} alt="" width={12} height={12} />
        {/* on hover the row names the limit a click adds */}
        <span className="more-idle">Optional limits</span>
        <span className="more-hover">{label}</span>
      </button>
      <div className={`rules-cell rules-value more-dots${wait ? " shimmer" : ""}`}>{!wait && "[...]"}</div>
      <div className={`rules-cell rules-status more-dots${wait ? " shimmer" : ""}`}>{!wait && "[...]"}</div>
      <div className={`rules-cell rules-source more-dots${wait ? " shimmer" : ""}`}>{!wait && "[...]"}</div>
    </li>
  );
}

/** The range a box takes, as shown in grey while it is empty: "0–60m", "0–1", "0–359°". */
const rangeText = (spec: NumberSpec) => `${spec.min}–${spec.max}${spec.unit}`;

/** A number: the text box and its unit; an empty box shows the range it takes in grey. Out-of-range text is not committed. */
function NumberCell({ paths, spec, value, state, label, hint }: { paths: FieldPath[]; spec: NumberSpec; value: number | null; state: State; label: string; hint?: string }) {
  const setOverride = useSiteStore((s) => s.setOverride);
  const clearOverride = useSiteStore((s) => s.clearOverride);
  const [text, setText] = useState(value === null ? "" : fmt(value));
  // follow outside changes (placeholders, reset) but never rewrite what is being typed
  useEffect(() => {
    if (value === null ? text !== "" : Number(text.replace(",", ".")) !== value) setText(value === null ? "" : fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = Number(text.replace(",", "."));
  const bad = text.trim() !== "" && !(Number.isFinite(parsed) && parsed >= spec.min && parsed <= spec.max);
  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return paths.forEach((p) => clearOverride(p));
    const n = Number(raw.replace(",", "."));
    if (Number.isFinite(n) && n >= spec.min && n <= spec.max) paths.forEach((p) => setOverride(p, n));
  };
  return (
    <label className={`rules-num t-semimono ${state}${bad ? " bad" : ""}`} title={`${spec.min}–${spec.max}${spec.unit ? ` ${spec.unit}` : ""}`}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={hint ?? rangeText(spec)}
        aria-label={label}
        onChange={(e) => commit(e.target.value)}
      />
      {spec.unit && text.trim() !== "" && <span className="unit">{spec.unit}</span>}
    </label>
  );
}

/** The allowed functions: one chip each; a click opens the list of uses to switch on and off. */
function ListCell({ value, state }: { value: string[] | null; state: State }) {
  const setOverride = useSiteStore((s) => s.setOverride);
  const clearOverride = useSiteStore((s) => s.clearOverride);
  const button = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const selected = value ?? [];
  // what is on stays in the list even when it is not one of the offered uses (a plan can name others)
  const options = [...FUNCTION_OPTIONS, ...selected.filter((v) => !FUNCTION_OPTIONS.includes(v))];

  const close = () => setBox(null);
  const toggle = () => {
    const cell = button.current?.closest(".rules-value");
    const page = button.current?.closest(".landing");
    if (!cell || !page) return;
    if (box) return close();
    const c = cell.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    setBox({ left: c.left - p.left, top: c.bottom - p.top });
  };
  // a click outside, or Escape, closes the list
  useEffect(() => {
    if (!box) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !(t as Element).closest?.(".rules-menu")) close();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [box]);

  const pick = (o: string) => {
    const next = selected.includes(o) ? selected.filter((v) => v !== o) : [...selected, o];
    // an empty list is no rule: back to what the plan said
    if (next.length) setOverride("allowedFunctions", next);
    else clearOverride("allowedFunctions");
  };

  const shown = selected.length > 3 ? [...selected.slice(0, 2), `+${selected.length - 2}`] : selected;
  const page = button.current?.closest(".landing");
  return (
    <>
      <button ref={button} type="button" className={`rules-chips ${state}`} aria-haspopup="listbox" aria-expanded={!!box} aria-label="Allowed functions" onClick={toggle}>
        {/* the row is two cells high: three chips at most, the rest as a count */}
        {shown.length ? (
          shown.map((v) => (
            <span key={v} className="chip t-semimono">
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </span>
          ))
        ) : (
          <span className="rules-empty t-semimono">Select</span>
        )}
      </button>
      {box &&
        page &&
        createPortal(
          <ul className="rules-menu t-semimono" role="listbox" aria-multiselectable aria-label="Allowed functions" style={{ left: box.left, top: box.top }}>
            {options.map((o) => {
              const on = selected.includes(o);
              return (
                <li
                  key={o}
                  role="option"
                  aria-selected={on}
                  className={on ? "on" : undefined}
                  // mousedown, not click: the cell must not lose focus before the choice is made
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeLinejoin="round" />
                  </svg>
                  {o}
                </li>
              );
            })}
          </ul>,
          page,
        )}
    </>
  );
}

/** The buildable area from the plan map (read-only: the plan's outline cannot be typed). */
function AreaCell({ value, state }: { value: unknown; state: State }) {
  const rings = (value as { coordinates: [number, number][][] } | null)?.coordinates;
  return (
    <span className={`rules-num t-semimono ${state}`}>
      {rings ? <span>{Math.round(polygonWithHolesArea(rings))}</span> : null}
      <span className={rings ? "unit" : "unit empty"}>m²</span>
    </span>
  );
}

/** A constraint as a row. */
function FieldRow({ idx, path, constraints, sub, onRemove }: { idx: number; path: FieldPath; constraints: SiteConstraints; sub?: boolean; onRemove?: () => void }) {
  const info = useInfo(path, constraints);
  const source = useSource(path, info);
  let value: ReactNode;
  let valueText: string;
  if (path === "allowedFunctions") {
    const list = (info.value as string[] | null) ?? [];
    value = <ListCell value={info.value as string[] | null} state={info.state} />;
    valueText = list[0] ?? "Select";
  } else if (path === "bouwvlak") {
    const rings = (info.value as { coordinates: [number, number][][] } | null)?.coordinates;
    value = <AreaCell value={info.value} state={info.state} />;
    valueText = rings ? `${Math.round(polygonWithHolesArea(rings))}m²` : "m²";
  } else {
    const spec = NUMBER_SPECS[path]!;
    value = <NumberCell paths={[path]} spec={spec} value={info.value as number | null} state={info.state} label={LABELS[path]!} />;
    valueText = info.value === null ? rangeText(spec) : `${fmt(info.value as number)}${spec.unit}`;
  }
  return (
    <Item
      idx={idx}
      icon={ICONS[path]!}
      label={LABELS[path]!}
      sub={sub}
      tall={path === "allowedFunctions"}
      turned={path === "maxHeight" || path === "maxGutterHeight"}
      value={value}
      valueText={valueText}
      state={info.state}
      source={source}
      onRemove={onRemove}
    />
  );
}

/** The setbacks: a summary row, with street, side and rear below it. */
function SetbacksRows({ idx, constraints }: { idx: number; constraints: SiteConstraints }) {
  const clearOverride = useSiteStore((s) => s.clearOverride);
  const a = useInfo(SETBACKS[0]!, constraints);
  const b = useInfo(SETBACKS[1]!, constraints);
  const c = useInfo(SETBACKS[2]!, constraints);
  const all = [a, b, c];
  const state: State = all.some((i) => i.state === "unknown") ? "unknown" : "known";
  const same = a.value !== null && a.value === b.value && b.value === c.value;
  const anyTyped = all.some((i) => i.overridden && !i.suggested);
  const anySuggested = all.some((i) => i.suggested);
  const resetAll = () => SETBACKS.forEach((p) => clearOverride(p));
  const scene = useSiteStore((s) => s.scene);
  const source: Source = state === "unknown"
    ? { label: "Missing", missing: true }
    : anyTyped
      ? { label: "Override", reset: resetAll }
      : anySuggested
        ? { label: "Suggested", reset: resetAll }
        : { label: "Zoning plan", href: scene?.zoning?.textRefs?.[0]?.url };
  return (
    <>
      <Item
        idx={idx}
        icon={setbacksIcon}
        label="Setbacks"
        value={
          // one value for all three; typing here overrides street, side and rear alike
          <NumberCell paths={SETBACKS} spec={NUMBER_SPECS[SETBACKS[0]!]!} value={same ? (a.value as number) : null} state={state} label="Setbacks" hint={!same && all.some((i) => i.value !== null) ? "Mixed" : undefined} />
        }
        valueText={same ? `${a.value}m` : all.some((i) => i.value !== null) ? "Mixed" : rangeText(NUMBER_SPECS[SETBACKS[0]!]!)}
        state={state}
        source={source}
      />
      {SETBACKS.map((p, k) => <FieldRow key={p} idx={idx + 1 + k} path={p} constraints={constraints} sub />)}
    </>
  );
}

type RulesPanelProps = {
  grid: Grid;
  /** The window and its bottom band, in page cells. */
  layout: { panel: Cells; panelBand: Cells };
  /** The studio's use: where the arrow and the back arrow lead (on the landing: the site model, one step back on the globe). */
  onContinue?: () => void;
  continueLabel?: string;
  onBack?: () => void;
  /** Show the table at once, without the reveal (the rules were read before). */
  instant?: boolean;
};

/** Rules window (UI-2): opens right of the globe window once the plot step's arrow is clicked. Known rules read-only, missing ones as inputs. */
export function RulesPanel({ grid, layout, onContinue, continueLabel = "Start exploring", onBack, instant = false }: RulesPanelProps) {
  const address = useLandingStore((s) => s.address);
  const loading = useSiteStore((s) => s.loading);
  const error = useSiteStore((s) => s.error);
  const fillPlaceholders = useSiteStore((s) => s.fillPlaceholders);
  const clearOverride = useSiteStore((s) => s.clearOverride);
  const constraints = useConstraints();
  const openModel = useLandingStore((s) => s.openModel);
  const back = useLandingStore((s) => s.back);
  const phase = useLandingStore((s) => s.phase);
  const model = useLandingStore((s) => s.model);
  const [asked, setAsked] = useState(false);
  // the optional limits (gutter height, street side) show only once the user has added them
  const [added, setAdded] = useState<FieldPath[]>([]);

  // the site model (three.js) is the next step: load its code while the rules are being filled
  useEffect(() => void import("./model/SiteModel"), []);

  // the site (parcel, plan data, parking policy) of the chosen address; everything behind it is cached on the server
  const label = address?.label;
  useEffect(() => {
    if (!label) return;
    setAsked(true);
    void useSiteStore.getState().load(label);
  }, [label]);

  // until the plan data is in the table has the same rows, every value unknown (and scrambling)
  const sc = constraints ?? LOADING;
  const shown = (p: FieldPath) => !MORE.includes(p) || added.includes(p);
  const required = useMemo(() => CONSTRAINT_FIELDS.filter((f) => isInput(f) && shown(f.path)), [added]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = required.filter((f) => (getField(sc, f.path)?.value ?? null) === null);
  const complete = !!constraints && missing.length === 0;
  // opened without an address (the studio's default site): the loaded scene is the one to show
  const ready = (asked || !label) && !loading && !!constraints;

  // the reveal: once the data is in, one more row every STAGGER_MS; the count line is last
  // revealed: the header, band and left column fade in; rowsOn: the rows may start their turns (after that fade)
  const quick = instant || reducedMotion();
  const [revealed, setRevealed] = useState(quick);
  const [rowsOn, setRowsOn] = useState(quick);
  useEffect(() => {
    if (revealed) return;
    const id = setTimeout(() => setRevealed(true), SHIMMER_MS);
    return () => clearTimeout(id);
  }, [revealed]);
  useEffect(() => {
    if (rowsOn) return;
    const id = setTimeout(() => setRowsOn(true), SHIMMER_MS + ROWS_AFTER_MS);
    return () => clearTimeout(id);
  }, [rowsOn]);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!ready || !rowsOn) return setStage(0);
    if (quick) return setStage(Number.POSITIVE_INFINITY);
    let k = 0;
    const id = setInterval(() => {
      setStage(++k);
      if (k >= STAGES + RESOLVE_TICKS) clearInterval(id);
    }, STAGGER_MS);
    return () => clearInterval(id);
  }, [ready, rowsOn, quick]);
  // the count line does not scramble: it fades in once the last row has unscrambled
  const countShown = stage >= STAGES + RESOLVE_TICKS;

  const fillAll = () => {
    const values: Overrides = {};
    for (const f of missing) values[f.path] = f.kind === "list" ? LIST_PLACEHOLDER : NUMBER_SPECS[f.path]!.placeholder;
    fillPlaceholders(values);
  };

  const { chip, street, place } = useSiteHeader();

  // everything sits in one box, the window's, so that it can grow from its left edge as a whole
  const win = boxStyle(grid, layout.panel);
  const rel = (b: BoxStyle): BoxStyle => ({ left: b.left - win.left, top: b.top - win.top, width: b.width, height: b.height });
  const top = rel(boxStyle(grid, { c0: layout.panel.c0, c1: layout.panel.c1, r0: layout.panel.r0, r1: layout.panelBand.r0 } satisfies Cells));
  const band = rel(boxStyle(grid, layout.panelBand));
  const fillBox = rel(boxStyle(grid, { c0: layout.panelBand.c0 + 1, c1: layout.panelBand.c0 + 7, r0: layout.panelBand.r0 + 1, r1: layout.panelBand.r0 + 2 }));
  // the arrow is one cell; once every field has a value it grows to the left (to the same right edge) and says what it does
  const goBox = rel(boxStyle(grid, { c0: layout.panelBand.c0 + (complete ? 10 : 13), c1: layout.panelBand.c0 + 14, r0: layout.panelBand.r0 + 1, r1: layout.panelBand.r0 + 2 }));
  const statusStyle: CSSProperties = { left: fillBox.left, top: fillBox.top - LABEL_GAP - LABEL_LINE, height: LABEL_LINE, whiteSpace: "pre" };

  // the count line
  const countParts: { text: string; className?: string }[] = complete
    ? [{ text: "Good to go!", className: "accent" }]
    : [
        { text: `${missing.length} ${missing.length === 1 ? "field" : "fields"}`, className: "accent" },
        { text: ` ${missing.length === 1 ? "needs" : "need"} input` },
      ];

  return (
    <StageContext.Provider value={stage}>
    <div className={`box rules-grow${revealed ? "" : " growing"}`} style={{ left: win.left, top: win.top, width: win.width, height: win.height }}>
      <section className="box window rules-window" style={{ left: 0, top: 0, width: win.width, height: win.height }} aria-label="Zoning and limits" />
      <div className="box rules-top" style={{ left: top.left + 1, top: top.top + 1, width: top.width - 2, height: top.height - 2 }}>
        <header className="rules-header">
          <h2 className="rules-heading t-regular">
            Zoning
            <br />
            and limits
          </h2>
          <div className="rules-details">
            <span className="rules-chip t-semimono">{chip}</span>
            <div className="rules-where">
              {/* the same grey arrow as in the input band, one cell, centred on the blue address */}
              <button type="button" className="rules-back" aria-label="Back" disabled={onBack ? false : phase !== "plot" || model !== "off"} onClick={onBack ?? back}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ display: "block", transform: "scaleX(-1)" }}>
                  <path d="M3.33333 8H12.6667" stroke="var(--stroke)" strokeLinejoin="round" />
                  <path d="M8 3.33333L12.6667 8L8 12.6667" stroke="var(--stroke)" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="rules-address t-semimono">
                {street}
                <br />
                {place}
              </span>
            </div>
          </div>
        </header>
        {error && <p className="rules-note t-semimono">{`Could not read the plan data: ${error}`}</p>}
        {!error && (
          <ul className="rules-list t-semimono">
            {MAIN.map((p, k) => (
              <FieldRow key={p} idx={k} path={p} constraints={sc} />
            ))}
            <SetbacksRows idx={MAIN.length} constraints={sc} />
            {MORE.map((p, k) =>
              shown(p) ? (
                <FieldRow
                  key={p}
                  idx={MAIN.length + 4 + k}
                  path={p}
                  constraints={sc}
                  onRemove={() => {
                    // the row goes back to "Optional limits" and its value stops counting
                    setAdded((a) => a.filter((x) => x !== p));
                    clearOverride(p);
                  }}
                />
              ) : (
                <OptionalRow key={p} idx={MAIN.length + 4 + k} label={LABELS[p]!} onAdd={() => setAdded((a) => [...a, p])} />
              ),
            )}
          </ul>
        )}
      </div>
      <div className="box input-band rules-band" style={band} />
      <label className={`box t-semimono t-label rules-count${countShown ? " on" : ""}`} style={statusStyle}>
        {countParts.map((p, k) => (
          <span key={k} className={p.className}>
            {p.text}
          </span>
        ))}
      </label>
      {/* with the count line: a slow fade once the last row has unscrambled */}
      <button type="button" className={`box rules-fill rules-late t-semimono t-input${countShown ? " on" : ""}`} style={fillBox} disabled={!ready || complete || !countShown} onClick={fillAll}>
        Fill with suggested values
        <img src={suggestIcon} alt="" width={12} height={12} />
      </button>
      {/* The arrow turns blue once every rule has a value; it opens the site model. */}
      <button type="button" className={`box go rules-go${complete ? " ready" : ""}`} style={goBox} aria-disabled={!complete} aria-label={complete ? continueLabel : "Continue"} onClick={() => complete && (onContinue ?? openModel)()}>
        {complete && <span className="go-label t-semimono">{continueLabel}</span>}
        <img src={arrowUrl} alt="" />
      </button>
    </div>
    </StageContext.Provider>
  );
}
