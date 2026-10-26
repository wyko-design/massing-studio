import { OPTION_IDS, type OptionId, computeMassing, useMassingStore } from "../state/massingStore";
import { useSiteStore } from "../state/siteStore";
import { usePresentStore } from "../state/presentStore";
import { useAiStore } from "../state/aiStore";
import * as api from "../api/ai";
import { resolveEnvelope, isPlaceholder } from "@massing/shared";
import { buildReportModel, type ReportInput } from "./model";
import { buildPdf } from "./pdf";

export type ReportProgress = (message: string) => void;
export type ReportResult = { url: string; fileName: string; bytes: number; narrative: "written" | "cached" | "skipped" | "failed"; narrativeError?: string };

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Renders every option from the view on screen (the studio's square), optionally asks the report writer for the
 * narrative (SPEC §7: its numbers are filled in by code), and writes the PDF. Reads the current
 * stores; nothing here changes them.
 */
export async function generateReport(opts: { narrative: boolean }, progress: ReportProgress): Promise<ReportResult> {
  const { scene } = useSiteStore.getState();
  const constraints = useSiteStore.getState().effectiveConstraints();
  if (!scene || !constraints) throw new Error("Load a site first.");
  const envelope = resolveEnvelope(scene.parcel.ring, constraints);
  const { programme } = useMassingStore.getState();
  const directions = useAiStore.getState().directions.result?.options ?? [];

  const results = OPTION_IDS.map((id) => ({ id, result: computeMassing(id), params: useMassingStore.getState().options[id] }));
  if (results.some((r) => !r.result)) throw new Error("Could not compute the options.");
  const options: ReportInput["options"] = results.map((r) => {
    const d = directions.find((x) => x.id === r.id);
    return { id: r.id, params: r.params, result: r.result!, ...(d ? { name: d.name, intent: d.intent, tradeOffs: d.tradeOffs } : {}) };
  });

  // renders: every option from the same view, the one on screen
  const present = usePresentStore.getState();
  const render = async (id: OptionId, multiplier: 1 | 2) => new Uint8Array(await (await present.renderForReport(id, multiplier)).arrayBuffer());
  const optionImages: Uint8Array[] = [];
  for (const o of options) {
    progress(`Rendering option ${o.id}…`);
    optionImages.push(await render(o.id as OptionId, 1));
  }
  progress("Rendering the cover…");
  const cover = await render(useMassingStore.getState().active, 2);

  let narrative: ReportInput["narrative"] = null;
  let narrativeState: ReportResult["narrative"] = "skipped";
  let narrativeError: string | undefined;
  if (opts.narrative) {
    if (directions.length === 0) {
      narrativeError = "Generate directions first: the narrative needs the option names and intents.";
      narrativeState = "failed";
    } else {
      progress("Writing the narrative…");
      try {
        const { data, cached } = await api.writeReport({
          address: scene.meta?.address ?? scene.parcel.id,
          parcelId: scene.parcel.id,
          parcelAreaM2: scene.parcel.areaM2,
          constraints,
          options: directions.map((d) => {
            const live = options.find((o) => o.id === d.id)!;
            return { id: d.id, name: d.name, intent: d.intent, tradeOffs: d.tradeOffs, params: live.params, clamps: live.result.clamps, metrics: live.result.metrics };
          }),
        });
        narrative = data;
        narrativeState = cached ? "cached" : "written";
      } catch (e) {
        narrativeError = api.describeError(e);
        narrativeState = "failed";
      }
    }
  }

  progress("Writing the PDF…");
  const model = buildReportModel({
    scene,
    constraints,
    envelope,
    programme,
    options,
    placeholder: isPlaceholder(constraints, envelope),
    date: new Date().toISOString().slice(0, 10),
    narrative,
  });
  const bytes = await buildPdf(model, { cover, options: optionImages });
  const fileName = `massing-report-${fileSafe(scene.parcel.id)}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  return { url, fileName, bytes: bytes.length, narrative: narrativeState, ...(narrativeError ? { narrativeError } : {}) };
}
