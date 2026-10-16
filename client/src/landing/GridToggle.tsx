import type { BoxStyle } from "./grid";

/** 1×1-cell button that shows the overlay grid; the icon follows the button's text colour. */
export function GridToggle({ box, on, onToggle }: { box: BoxStyle; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="box toggle"
      style={box}
      aria-pressed={on}
      aria-label="Show grid (G)"
      title="Show grid (G)"
      onClick={onToggle}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M0.5 0.5H15.5V15.5H0.5Z M5.5 0.5V15.5 M10.5 0.5V15.5 M0.5 5.5H15.5 M0.5 10.5H15.5" stroke="currentColor" />
      </svg>
    </button>
  );
}
