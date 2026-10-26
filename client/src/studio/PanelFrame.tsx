import type { CSSProperties, ReactNode } from "react";
import arrowUrl from "../landing/assets/arrow.svg";
import { boxStyle, type BoxStyle, type Cells, type Grid } from "../landing/grid";
import { ShuffleText, type TextPart } from "../landing/ShuffleText";
import { useSiteHeader } from "../landing/RulesPanel";

/** Gap between the band's label line and the buttons, as in the rules window and the input band. */
const LABEL_GAP = 4;
const LABEL_LINE = 12;

export type Tab<T extends string> = { id: T; label: string; count?: number };

type Button = { label: string; icon?: string; onClick: () => void; disabled?: boolean; title?: string };

type Props<T extends string> = {
  grid: Grid;
  panel: Cells;
  band: Cells;
  /** Two lines, like "Zoning / and limits". */
  heading: [string, string];
  onBack?: () => void;
  tabs: Tab<T>[];
  tab: T;
  onTab: (tab: T) => void;
  children: ReactNode;
  /** The band's label line; `busy` scrambles it while a call runs. */
  status: TextPart[];
  busy?: boolean;
  /** The outlined button (the screen's AI or secondary action), six cells wide. */
  secondary?: Button;
  /** The blue arrow with its label: the next step. */
  go: Button;
};

/**
 * A studio panel: the rules window's frame (page-background window that grows from its left edge, the header with heading,
 * plot chip, back arrow and address, the bottom band with a label, an outlined button and the blue arrow), with a row of
 * three tabs under the header and a table body.
 */
export function PanelFrame<T extends string>({ grid, panel, band: bandCells, heading, onBack, tabs, tab, onTab, children, status, busy, secondary, go }: Props<T>) {
  const { chip, street, place } = useSiteHeader();
  const win = boxStyle(grid, panel);
  const rel = (b: BoxStyle): BoxStyle => ({ left: b.left - win.left, top: b.top - win.top, width: b.width, height: b.height });
  const top = rel(boxStyle(grid, { c0: panel.c0, c1: panel.c1, r0: panel.r0, r1: bandCells.r0 }));
  const band = rel(boxStyle(grid, bandCells));
  const secondaryBox = rel(boxStyle(grid, { c0: bandCells.c0 + 1, c1: bandCells.c0 + 8, r0: bandCells.r0 + 1, r1: bandCells.r0 + 2 }));
  const goBox = rel(boxStyle(grid, { c0: bandCells.c0 + 9, c1: bandCells.c0 + 14, r0: bandCells.r0 + 1, r1: bandCells.r0 + 2 }));
  const statusStyle: CSSProperties = { left: secondaryBox.left, top: secondaryBox.top - LABEL_GAP - LABEL_LINE, height: LABEL_LINE, width: goBox.left + goBox.width - secondaryBox.left, whiteSpace: "pre", overflow: "hidden" };

  return (
    <div className="box rules-grow studio-panel" style={win}>
      <section className="box window rules-window" style={{ left: 0, top: 0, width: win.width, height: win.height }} aria-label={heading.join(" ")} />
      <div className="box rules-top" style={{ left: top.left + 1, top: top.top + 1, width: top.width - 2, height: top.height - 2 }}>
        <header className="rules-header">
          <h2 className="rules-heading t-regular">
            {heading[0]}
            <br />
            {heading[1]}
          </h2>
          <div className="rules-details">
            <span className="rules-chip t-semimono">{chip}</span>
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
          </div>
        </header>
        <ul className="panel-tabs t-semimono" role="tablist">
          {tabs.map((t) => (
            <li key={t.id} role="presentation">
              <button type="button" role="tab" aria-selected={t.id === tab} onClick={() => onTab(t.id)}>
                {t.label}
                {t.count ? <span className="count">{t.count}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <ul className="panel-body t-semimono" role="tabpanel">
          {children}
        </ul>
      </div>
      <div className="box input-band rules-band" style={band} />
      <label className="box t-semimono t-label rules-count on" style={statusStyle} aria-live="polite">
        <ShuffleText parts={status} scrambling={busy} />
      </label>
      {secondary && (
        <button type="button" className="box rules-fill t-semimono t-input" style={secondaryBox} disabled={secondary.disabled} title={secondary.title} onClick={secondary.onClick}>
          {secondary.label}
          {secondary.icon && <img src={secondary.icon} alt="" width={12} height={12} />}
        </button>
      )}
      <button type="button" className={`box go rules-go${go.disabled ? "" : " ready"}`} style={goBox} disabled={go.disabled} title={go.title} aria-label={go.label} onClick={go.onClick}>
        <span className="go-label t-semimono">{go.label}</span>
        <img src={arrowUrl} alt="" />
      </button>
    </div>
  );
}
