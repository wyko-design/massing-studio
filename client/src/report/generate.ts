import { OPTION_IDS, type OptionId, computeMassing, optionParams, optionText, useMassingStore } from "../state/massingStore";
import { useSiteStore } from "../state/siteStore";
import { usePresentStore } from "../state/presentStore";
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
  const { programme, custom } = useMassingStore.getState();

  // the four presets, and the custom option when there is one
  const options: ReportInput["options"] = [];
  for (const id of OPTION_IDS) {
    const params = optionParams(id);
    if (!params) continue;
    const result = computeMassing(id);
    if (!result) throw new Error("Could not compute the options.");
    const text = optionText(id, custom);
    options.push({ id, params, result, name: text.name, ...(text.intent ? { intent: text.intent } : {}), tradeOffs: text.tradeOffs });
  }

  // renders: every option from the same view, the one on screen
  const present = usePresentStore.getState();
  const render = async (id: OptionId, multiplier: 1 | 2) => new Uint8Array(await (await present.renderForReport(id, multiplier)).arrayBuffer());
  const optionImages: Uint8Array[] = [];
  for (const o of options) {
    progress(`Rendering ${o.name}…`);
    optionImages.push(await render(o.id as OptionId, 1));
  }
  progress("Rendering the cover…");
  const active = useMassingStore.getState().active;
  const cover = await render(options.some((o) => o.id === active) ? active : "homes", 2);

  let narrative: ReportInput["narrative"] = null;
  let narrativeState: ReportResult["narrative"] = "skipped";
  let narrativeError: string | undefined;
  if (opts.narrative) {
    progress("Writing the narrative…");
    try {
      const { data, cached } = await api.writeReport({
        address: scene.meta?.address ?? scene.parcel.id,
        parcelId: scene.parcel.id,
        parcelAreaM2: scene.parcel.areaM2,
        constraints,
        options: options.map((o) => ({
          id: o.id as OptionId,
          name: o.name!,
          intent: o.intent ?? "",
          tradeOffs: o.tradeOffs ?? [],
          params: o.params,
          clamps: o.result.clamps,
          metrics: o.result.metrics,
        })),
      });
      narrative = data;
      narrativeState = cached ? "cached" : "written";
    } catch (e) {
      narrativeError = api.describeError(e);
      narrativeState = "failed";
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
