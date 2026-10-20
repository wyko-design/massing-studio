import { useEffect, useState } from "react";
import { perfRecent } from "./perf";

/** Small readout of the perf probes (only mounted with `?perf`): phase, globe draw p95 (2 s), long tasks (10 s). */
export function PerfHud() {
  const [r, setR] = useState(perfRecent);
  useEffect(() => {
    const id = setInterval(() => setR(perfRecent()), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="t-semimono"
      style={{ position: "fixed", right: 8, bottom: 8, zIndex: 10, padding: "4px 8px", background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 11, lineHeight: "16px", pointerEvents: "none", whiteSpace: "pre" }}
    >
      {`${r.phase}\ndraw p95 ${r.drawP95} ms (${r.frames} fr / 2 s)\nlong tasks ${r.long} / 10 s, max ${r.longMax} ms`}
    </div>
  );
}
