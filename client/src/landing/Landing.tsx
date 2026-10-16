import { useEffect, useMemo, useState } from "react";
import "./landing.css";
import { CountryInput } from "./CountryInput";
import { GridLines } from "./GridLines";
import { GridToggle } from "./GridToggle";
import { Globe } from "./globe/Globe";
import type { GlobePlacement } from "./globe/GlobeRenderer";
import { LANDING_MIN_ROWS, boxStyle, landingLayout, lineY } from "./grid";
import { useLandingStore } from "./landingStore";
import { TOKEN_VARS } from "./tokens";
import { ShuffleText } from "./ShuffleText";
import { useGrid } from "./useGrid";

/** Hook block: sub-line sits this far below the title's line box (Figma). */
const SUB_GAP = 8;
const TITLE_LINE = 26;

/** Entry screen (UI-1): page grid, logo, window with the globe and the country step. */
export function Landing() {
  const grid = useGrid(LANDING_MIN_ROWS);
  const layout = landingLayout(grid);
  const [overlay, setOverlay] = useState(false);
  const country = useLandingStore((s) => s.country);
  const city = useLandingStore((s) => s.city);
  const address = useLandingStore((s) => s.address);
  const plotFailed = useLandingStore((s) => s.plotFailed);
  const phase = useLandingStore((s) => s.phase);
  const settle = useLandingStore((s) => s.settle);
  const startResolve = useLandingStore((s) => s.startResolve);
  const reset = useLandingStore((s) => s.reset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setOverlay((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // canvas = inside of the top band (inside the window border, above the divider line)
  const placement = useMemo<GlobePlacement>(() => {
    const band = boxStyle(grid, layout.topBand);
    const globe = boxStyle(grid, layout.globe);
    const left = band.left + 1;
    const top = band.top + 1;
    const width = band.width - 2;
    const height = band.height - 2;
    const gx = globe.left - left;
    const gy = globe.top - top;
    return {
      width,
      height,
      left,
      top,
      dpr: grid.dpr,
      idle: {
        cx: gx + globe.width / 2,
        cy: gy + globe.height / 2,
        r: (globe.width - 1) / 2,
        clip: { x: gx, y: gy, w: globe.width, h: globe.height },
      },
      full: { x: 0, y: 0, w: width, h: height },
    };
  }, [grid, layout.topBand, layout.globe]);

  const win = boxStyle(grid, layout.window);
  const hookTop = lineY(grid, layout.hookRow);
  const hidden = phase !== "idle" && phase !== "toIdle";

  return (
    <div className="landing" style={{ ...TOKEN_VARS, width: grid.width, height: grid.height }}>
      <GridLines grid={grid} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
        <button type="button" className="box logo t-semimono t-logo" style={boxStyle(grid, layout.logo)} onClick={reset} aria-label="Massing Studio, back to the globe">
          <span>
            <ShuffleText parts={[{ text: "MASSING" }]} />
          </span>
          <span>
            <ShuffleText parts={[{ text: "STUDIO" }]} />
          </span>
        </button>
        <GridToggle box={boxStyle(grid, layout.toggle)} on={overlay} onToggle={() => setOverlay((o) => !o)} />

        <div className="box window" style={win} />
        <Globe placement={placement} country={country} city={city} address={address} onSettled={settle} onResolve={startResolve} onPlotFailed={plotFailed} />
        <div className={`box hook${hidden ? " hidden" : ""}`} style={{ left: win.left, top: hookTop, width: win.width }} aria-hidden={hidden}>
          <h1 className="t-regular t-hook" style={{ margin: 0, height: TITLE_LINE }}>
            <ShuffleText parts={[{ text: "Every site has a future to discover" }]} active={!hidden} />
          </h1>
          <p className="t-semimono t-sub" style={{ margin: `${SUB_GAP}px 0 0` }}>
            <ShuffleText parts={[{ text: "Just drop a pin" }]} active={!hidden} />
          </p>
        </div>

        <div className="box input-band" style={boxStyle(grid, layout.inputBand)} />
        <CountryInput grid={grid} layout={layout} />
      </div>
      {overlay && <GridLines grid={grid} overlay />}
    </div>
  );
}
