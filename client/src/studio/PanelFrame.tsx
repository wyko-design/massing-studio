import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import arrowUrl from "../landing/assets/arrow.svg";
import { boxStyle, type BoxStyle, type Cells, type Grid } from "../landing/grid";
import { ShuffleText, type TextPart } from "../landing/ShuffleText";
import { useSiteHeader } from "../landing/RulesPanel";

/** Gap between the band's label line and the buttons, as in the rules window and the input band. */
const LABEL_GAP = 4;
const LABEL_LINE = 12;
/** The window grows (600 ms, landing.css rules-grow) and its header and band shimmer until this moment; then the text fades in slowly, as in the rules window. */
const SHIMMER_MS = 2000;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Room under the label line for descenders (g, p, y), which `overflow: hidden` would cut. */
const DESCENDER = 4;

export type Tab<T extends string> = { id: T; label: ReactNode; count?: number };

type Button = { label: string; icon?: string; onClick: () => void; disabled?: boolean; title?: string; /** The arrow's place, but a white button (its icon instead of the arrow). */ white?: boolean };

type Props<T extends string> = {
  grid: Grid;
  panel: Cells;
  band: Cells;
  /** Two lines, like "Zoning / and limits". */
  heading: [string, string];
  onBack?: () => void;
  /** What the header says beside the heading: the site (plot chip, address) unless given; without lines only the chip, centred. */
  details?: { chip: string; chipIcon?: string; lines?: [string, string] } | false;
  tabs?: Tab<T>[];
  tab?: T;
  onTab?: (tab: T) => void;
  children: ReactNode;
  /** The body never scrolls: what does not fit is cut (the content is planned to fit). */
  fit?: boolean;
  /** The band's label line; `busy` scrambles it while a call runs. No label, button or arrow = no band: the body runs to the bottom. */
  status?: TextPart[];
  busy?: boolean;
  /** The outlined button (the screen's AI or secondary action), six cells wide. */
  secondary?: Button;
  /** The blue arrow with its label: the next step. */
  go?: Button;
};

/** The band's buttons in its one row, inside a cell of margin: the arrow at the right (5 cells, 4 in a narrow panel), the outlined button the rest. */
export function bandButtons(band: Cells, hasSecondary: boolean, hasGo: boolean): { secondary: Cells | null; go: Cells | null } {
  const W = band.c1 - band.c0;
  const row = { r0: band.r0 + 1, r1: band.r0 + 2 };
  const goCells = hasGo ? (W >= 14 ? 5 : 4) : 0;
  const gap = hasGo && hasSecondary && W >= 13 ? 1 : 0;
  const end = band.c1 - 1;
  return {
    go: hasGo ? { c0: end - goCells, c1: end, ...row } : null,
    secondary: hasSecondary ? { c0: band.c0 + 1, c1: end - goCells - gap, ...row } : null,
  };
}

/**
 * A studio panel: the rules window's frame (page-background window that grows from its left edge, the header with heading,
 * plot chip, back arrow and address, the bottom band with a label, an outlined button and the blue arrow), with a row of
 * tabs under the header and a table body. Fits panels 11 to 15 cells wide.
 */
export function PanelFrame<T extends string>({ grid, panel, band: bandCells, heading, onBack, details, tabs, tab, onTab, children, fit, status, busy, secondary, go }: Props<T>) {
  const site = useSiteHeader();
  const [revealed, setRevealed] = useState(reducedMotion);
  useEffect(() => {
    if (revealed) return;
    const id = setTimeout(() => setRevealed(true), SHIMMER_MS);
    return () => clearTimeout(id);
  }, [revealed]);
  const chip = details ? details.chip : site.chip;
  const chipOnly = !!details && !details.lines;
  const [street, place] = (details && details.lines) || [site.street, site.place];
  const win = boxStyle(grid, panel);
  const rel = (b: BoxStyle): BoxStyle => ({ left: b.left - win.left, top: b.top - win.top, width: b.width, height: b.height });
  const hasBand = !!(status || secondary || go);
  const top = rel(boxStyle(grid, { c0: panel.c0, c1: panel.c1, r0: panel.r0, r1: hasBand ? bandCells.r0 : panel.r1 }));
  const band = rel(boxStyle(grid, bandCells));
  const cellsOf = bandButtons(bandCells, !!secondary, !!go);
  const secondaryBox = cellsOf.secondary && rel(boxStyle(grid, cellsOf.secondary));
  const goBox = cellsOf.go && rel(boxStyle(grid, cellsOf.go));
  const line = rel(boxStyle(grid, { c0: bandCells.c0 + 1, c1: bandCells.c1 - 1, r0: bandCells.r0 + 1, r1: bandCells.r0 + 2 }));
  const statusStyle: CSSProperties = { left: line.left, top: line.top - LABEL_GAP - LABEL_LINE, height: LABEL_LINE + DESCENDER, width: line.width, whiteSpace: "pre", overflow: "hidden" };

  return (
    <div className={`box rules-grow studio-panel${panel.c1 - panel.c0 < 13 ? " narrow" : ""}${revealed ? "" : " growing"}`} style={win}>
      <section className="box window rules-window" style={{ left: 0, top: 0, width: win.width, height: win.height }} aria-label={heading.join(" ")} />
      <div className="box rules-top" style={{ left: top.left + 1, top: top.top + 1, width: top.width - 2, height: top.height - 2 }}>
        <header className="rules-header">
          <h2 className="rules-heading t-regular">
            {heading[0]}
            <br />
            {heading[1]}
          </h2>
          {details !== false && (
            <div className="rules-details">
              <span className="rules-chip t-semimono">
                {chip}
                {details && details.chipIcon && <img src={details.chipIcon} alt="" width={12} height={12} />}
              </span>
              {!chipOnly && (
                <div className="rules-where">
                  <button type="button" className="rules-back" aria-label="Back" disabled={!onBack} onClick={onBack} style={onBack ? undefined : { visibility: "hidden" }}>
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
              )}
            </div>
          )}
        </header>
        {tabs && (
          <ul className="panel-tabs t-semimono" role="tablist">
            {tabs.map((t) => (
              <li key={t.id} role="presentation">
                <button type="button" role="tab" aria-selected={t.id === tab} onClick={() => onTab?.(t.id)}>
                  {t.label}
                  {t.count ? <span className="count">{t.count}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className={`panel-body t-semimono${fit ? " fit" : ""}`} role={tabs ? "tabpanel" : undefined}>
          {children}
        </ul>
      </div>
      {hasBand && <div className={`box input-band rules-band${go?.white && !status && !secondary ? " bare" : ""}`} style={band} />}
      {status && (
        <label className={`box t-semimono t-label rules-count${revealed ? " on" : ""}`} style={statusStyle} aria-live="polite">
          <ShuffleText parts={status} scrambling={busy} />
        </label>
      )}
      {secondary && secondaryBox && (
        <button type="button" className="box rules-fill t-semimono t-input" style={secondaryBox} disabled={secondary.disabled} title={secondary.title} onClick={secondary.onClick}>
          {secondary.label}
          {secondary.icon && <img src={secondary.icon} alt="" width={12} height={12} />}
        </button>
      )}
      {go && goBox && (
        <button type="button" className={`box go rules-go${go.white ? " white" : ""}${go.disabled ? "" : " ready"}`} style={goBox} disabled={go.disabled} title={go.title} aria-label={go.label} onClick={go.onClick}>
          <span className="go-label t-semimono">{go.label}</span>
          <img src={go.white && go.icon ? go.icon : arrowUrl} alt="" />
        </button>
      )}
    </div>
  );
}
