import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Landing } from "./landing/Landing";
import { GridLines } from "./landing/GridLines";
import { useGrid } from "./landing/useGrid";
import { TOKEN_VARS } from "./landing/tokens";
import { isStudioHash } from "./routes";
import { STUDIO_MIN_ROWS } from "./studio/layout";

// the studio (three.js, R3F) loads only when it is opened; the landing's last screen starts loading it early
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));

/** While the studio's code loads: the empty page grid, so the hand-over never flashes white. */
function StudioFallback() {
  const grid = useGrid(STUDIO_MIN_ROWS);
  return (
    <div className="landing" style={{ ...TOKEN_VARS, position: "relative", width: grid.width, height: grid.height, background: "var(--background)" }}>
      <GridLines grid={grid} />
    </div>
  );
}

/** Landing screen by default; the studio at #studio and its screens (#studio/rules, /directions, /present). */
export function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const was = useRef(hash);
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash;
      // back from the studio to the landing: start the landing afresh (its globe cannot resume mid-flow)
      if (isStudioHash(was.current) && !isStudioHash(next)) return window.location.reload();
      was.current = next;
      setHash(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (isStudioHash(hash)) {
    return (
      <Suspense fallback={<StudioFallback />}>
        <App hash={hash} />
      </Suspense>
    );
  }
  return <Landing />;
}
