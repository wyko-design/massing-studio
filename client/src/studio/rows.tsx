import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import checkIcon from "../landing/assets/rules/check.svg";
import unknownIcon from "../landing/assets/rules/unknown.svg";

/**
 * Table rows of the studio panels, in the rules window's style: a title cell (icon + text, 160 px), a white value cell
 * (96 px, blue text when it holds a value), and the rest of the row (a slider, a status tag, a note). Every row is one grid
 * cell high; the cell borders land on the page grid's lines.
 */

const round = (x: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Number((Math.round(x / step) * step).toFixed(digits));
};

/** A number as the value cell shows it: the step's decimals, no trailing noise. */
export const fmtStep = (x: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return x.toFixed(digits);
};

export function Title({ icon, label, turned }: { icon?: string; label: ReactNode; turned?: boolean }) {
  return (
    <div className="rules-cell rules-title t-semimono">
      {icon && <img src={icon} alt="" width={12} height={12} style={turned ? { transform: "rotate(90deg)" } : undefined} />}
      <span>{label}</span>
    </div>
  );
}

/** A section: grey title, an optional hint at the right. */
export function Section({ label, hint }: { label: string; hint?: ReactNode }) {
  return (
    <li className="section t-semimono">
      <span>{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </li>
  );
}

/** Typed number in the value cell: commits while typing when it is a number in range; the grey range shows while empty. */
function NumberText({ value, min, max, step, unit, label, onChange, disabled }: { value: number; min: number; max: number; step: number; unit?: string; label: string; onChange: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(fmtStep(value, step));
  const [editing, setEditing] = useState(false);
  // follow the slider and outside changes, never rewrite what is being typed
  useEffect(() => {
    if (!editing) setText(fmtStep(value, step));
  }, [value, step, editing]);
  const parsed = Number(text.replace(",", "."));
  const bad = text.trim() !== "" && !(Number.isFinite(parsed) && parsed >= min && parsed <= max);
  return (
    <label className={`rules-num t-semimono known${bad ? " bad" : ""}`} title={`${min}–${max}${unit ? ` ${unit}` : ""}`}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={`${min}–${max}`}
        aria-label={label}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          setText(fmtStep(value, step));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(round(n, step));
        }}
      />
      {unit && text.trim() !== "" && <span className="unit">{unit}</span>}
    </label>
  );
}

/** The line slider (no LLM: it only edits a store). `--fill` paints the line blue up to the value. */
export function Range({ value, min, max, step, label, onChange, disabled }: { value: number; min: number; max: number; step: number; label: string; onChange: (v: number) => void; disabled?: boolean }) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      style={{ "--fill": `${Math.max(0, Math.min(100, fill))}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export type SliderSpec = { min: number; max: number; step: number; unit?: string };

/** Title · typed value · slider. */
export function SliderRow({ icon, label, value, spec, onChange, sub, disabled, turned }: { icon?: string; label: string; value: number; spec: SliderSpec; onChange: (v: number) => void; sub?: boolean; disabled?: boolean; turned?: boolean }) {
  return (
    <li className={`row${sub ? " sub" : ""}`}>
      <Title icon={icon} label={label} turned={turned} />
      <div className="cell-value">
        <NumberText value={value} {...spec} label={label} onChange={onChange} disabled={disabled} />
      </div>
      <div className="cell-slider">
        <Range value={value} {...spec} label={label} onChange={onChange} disabled={disabled} />
      </div>
    </li>
  );
}

export type Choice<T> = { value: T; text: ReactNode; disabled?: boolean; title?: string };

/** Adjoining choice cells: the chosen one white with blue text. */
export function Segments<T extends string | number>({ value, options, onChange, label }: { value: T; options: Choice<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segments t-semimono" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>
          {o.text}
        </button>
      ))}
    </div>
  );
}

/** Title · choices across the rest of the row (no title: the choices span the row). */
export function SegmentRow<T extends string | number>({ icon, label, value, options, onChange, hideTitle }: { icon?: string; label: string; value: T; options: Choice<T>[]; onChange: (v: T) => void; hideTitle?: boolean }) {
  return (
    <li className={`row ${hideTitle ? "full" : "wide"}`}>
      {!hideTitle && <Title icon={icon} label={label} />}
      <Segments value={value} options={options} onChange={onChange} label={label} />
    </li>
  );
}

/** Title · on/off box · note. */
export function ToggleRow({ icon, label, on, onChange, note, disabled }: { icon?: string; label: string; on: boolean; onChange: (on: boolean) => void; note?: ReactNode; disabled?: boolean }) {
  return (
    <li className="row">
      <Title icon={icon} label={label} />
      <div className="cell-value">
        <button type="button" className="check t-semimono" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
          <span className="box-mark" aria-hidden>
            {on && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M10 3L4.5 8.5L2 6" stroke="var(--white)" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          {on ? "On" : "Off"}
        </button>
      </div>
      <div className="cell-note t-semimono">{note && <span className="muted">{note}</span>}</div>
    </li>
  );
}

/** Title · read-only value (blue; grey when unknown) · note. */
export function ValueRow({ icon, label, value, note, unknown, sub, turned }: { icon?: string; label: string; value: ReactNode; note?: ReactNode; unknown?: boolean; sub?: boolean; turned?: boolean }) {
  return (
    <li className={`row${sub ? " sub" : ""}`}>
      <Title icon={icon} label={label} turned={turned} />
      <div className={`cell-value static t-semimono${unknown ? " unknown" : ""}`}>{value}</div>
      <div className="cell-note t-semimono">{note}</div>
    </li>
  );
}

/** One half of a paired row: a title and its value (a number, a tag). The detail shows on hover. */
export type PairCell = { icon?: string; turned?: boolean; label: string; value: ReactNode; detail?: string; tag?: boolean };

/** Two title · value pairs in one row (3 + 2 and 3 + 3 cells), for read-outs that must fit a panel without scrolling. */
export function PairRow({ cells }: { cells: [PairCell, PairCell?] }) {
  return (
    <li className="row pair">
      {cells.map((c, i) =>
        c ? (
          <div key={i} className="pair-half" title={c.detail}>
            <Title icon={c.icon} label={c.label} turned={c.turned} />
            <div className={c.tag ? "cell-value tag" : "cell-value static t-semimono"}>{c.value}</div>
          </div>
        ) : null,
      )}
    </li>
  );
}

export type CheckStatus = "pass" | "fail" | "unknown";
const STATUS_WORDS: Record<CheckStatus, string> = { pass: "PASS", fail: "FAIL", unknown: "UNKNOWN" };

/** A compliance tag: PASS grey with a tick, FAIL blue (it needs attention), UNKNOWN outlined. */
export function CheckTag({ status }: { status: CheckStatus }) {
  return (
    <span className={`rules-tag ${status === "unknown" ? "open" : status}`}>
      {STATUS_WORDS[status]}
      {status === "pass" && <img src={checkIcon} alt="" width={12} height={12} />}
      {status === "fail" && <img src={unknownIcon} alt="" width={12} height={12} />}
    </span>
  );
}

/** Title · status tag · the computed detail (two lines at most, the rest in the tooltip). */
export function CheckRow({ icon, label, status, detail }: { icon?: string; label: string; status: CheckStatus; detail: string }) {
  return (
    <li className="row" title={detail}>
      <Title icon={icon} label={label} />
      <div className="cell-value" style={{ justifyContent: "center", background: "var(--background)" }}>
        <CheckTag status={status} />
      </div>
      <div className="cell-note t-semimono">
        <span className="clamp">{detail}</span>
      </div>
    </li>
  );
}

/** A whole row as one button (a camera preset, "Reset option A"). */
export function ActionRow({ icon, label, onClick, disabled, note }: { icon?: string; label: string; onClick: () => void; disabled?: boolean; note?: ReactNode }) {
  return (
    <li className="row wide">
      <button type="button" className="row-action t-semimono" onClick={onClick} disabled={disabled}>
        {icon && <img src={icon} alt="" width={12} height={12} />}
        {label}
      </button>
      <div className="cell-note t-semimono">{note}</div>
    </li>
  );
}

/** Free text in the table. */
export function Note({ children, small, white, accent, muted, rows2 }: { children: ReactNode; small?: boolean; white?: boolean; accent?: boolean; muted?: boolean; /** Exactly two grid rows (three lines, the rest cut). */ rows2?: boolean }) {
  const cls = ["note", "t-semimono", small && "small", white && "white", accent && "accent", muted && "muted", rows2 && "rows2"].filter(Boolean).join(" ");
  return <li className={cls}>{children}</li>;
}

/** Title · one of a list, opened under the cell in the rules window's menu (single choice). */
export function PickRow<T extends string>({ icon, label, value, options, onChange }: { icon?: string; label: string; value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const close = () => setBox(null);
  const toggle = () => {
    const cell = button.current?.closest(".cell-value");
    const page = button.current?.closest(".landing");
    if (!cell || !page) return;
    if (box) return close();
    const c = cell.getBoundingClientRect();
    const p = page.getBoundingClientRect();
    setBox({ left: c.left - p.left, top: c.bottom - p.top, width: c.width });
  };
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
  const current = options.find((o) => o.value === value);
  const page = button.current?.closest(".landing");
  return (
    <li className="row wide">
      <Title icon={icon} label={label} />
      <div className="cell-value" style={{ borderRight: 0 }}>
        <button ref={button} type="button" className="pick t-semimono" aria-haspopup="listbox" aria-expanded={!!box} aria-label={label} onClick={toggle}>
          <span>{current?.text ?? value}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ transform: box ? "rotate(180deg)" : undefined }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {box &&
        page &&
        createPortal(
          <ul className="rules-menu t-semimono" role="listbox" aria-label={label} style={{ left: box.left, top: box.top, width: box.width }}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  aria-disabled={o.disabled}
                  title={o.title}
                  className={o.disabled ? "off" : on ? "on" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (o.disabled) return;
                    onChange(o.value);
                    close();
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeLinejoin="round" />
                  </svg>
                  {o.text}
                </li>
              );
            })}
          </ul>,
          page,
        )}
    </li>
  );
}
