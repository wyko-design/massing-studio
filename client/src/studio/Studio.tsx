import { useEffect } from "react";
import "./studio.css";
import type { Grid } from "../landing/grid";
import { RulesPanel } from "../landing/RulesPanel";
import { siteView } from "../landing/model/siteView";
import { usePresentStore } from "../state/presentStore";
import { exportSide } from "../present/frame";
import { SCREEN_HASH, type StudioScreen } from "../routes";
import { DirectionsControls, OptionInfo } from "./DirectionsPanel";
import { PresentOutput } from "./PresentPanel";
import type { StudioLayout } from "./layout";

/** Back to the landing's first step: a fresh page (the globe cannot resume mid-flow). */
export function toLanding() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.location.reload();
}

function download(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

/**
 * Runs the export the Present screen asks for: the site model draws the job's option (the page passes it down), then
 * captures its square at the asked size. A report job hands the JPEG back instead of downloading it.
 */
function ExportRunner() {
  const job = usePresentStore((s) => s.job);
  const finish = usePresentStore((s) => s.finishExport);
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    void (async () => {
      const t0 = performance.now();
      try {
        // the model draws the job's option from the next commit on
        await new Promise((resolve) => setTimeout(resolve, 60));
        const view = siteView();
        if (!view) throw new Error("The model is not ready yet.");
        const side = exportSide(job.multiplier);
        const blob = await view.capture({ size: side, mime: job.deliver === "report" ? "image/jpeg" : "image/png" });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (job.deliver === "download") download(url, job.fileName);
        finish({ status: "done", url, fileName: job.fileName, width: side, height: side, bytes: blob.size, ms: Math.round(performance.now() - t0), blob });
      } catch (e) {
        if (!cancelled) finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job, finish]);
  return null;
}

/**
 * The studio's panels around the site model's square: Directions (controls left, the chosen option right), Export
 * (one panel at the right; browser back returns to Directions) and the rules (the landing's rules window, right of the square).
 */
export function StudioPanels({ grid, layout, screen }: { grid: Grid; layout: StudioLayout; screen: StudioScreen }) {
  const go = (s: StudioScreen) => {
    window.location.hash = SCREEN_HASH[s];
  };
  return (
    <>
      {/* keyed by screen: each opens with the rules window's grow */}
      <div key={screen}>
        {screen === "rules" ? (
          <RulesPanel grid={grid} layout={layout.rules} instant onBack={toLanding} onContinue={() => go("directions")} continueLabel="Directions" />
        ) : screen === "directions" ? (
          <>
            <DirectionsControls grid={grid} cells={layout.left} onBack={() => go("rules")} />
            <OptionInfo grid={grid} cells={layout.right} onPresent={() => go("present")} />
          </>
        ) : (
          <PresentOutput grid={grid} cells={layout.right} />
        )}
      </div>
      <ExportRunner />
    </>
  );
}
