import { z } from "zod";
import {
  CONSTRAINT_FIELDS,
  REPORT_SECTION_IDS,
  ReportSectionIdSchema,
  digitErrors,
  fmtM,
  fmtM2,
  fmtRatio,
  formatValue,
  getField,
  hasDigits,
  type WriteReportRequest,
  type WriteReportResult,
} from "@massing/shared";
import { callStructured, type AiResult } from "./callStructured";
import type { LlmClient } from "./llm/types";
import { loadPrompt, render } from "./prompts";

export const PROMPT = loadPrompt("reportWriter", "v1");

export const ReportWireSchema = z.object({
  sections: z.array(z.object({ id: ReportSectionIdSchema, title: z.string(), text: z.string() })),
});
export type ReportWire = z.infer<typeof ReportWireSchema>;

const TOKEN = /\{\{([\w.]+)\}\}/g;

/** Every value the report may cite, formatted by code. The model writes `{{token}}`; code fills it in. */
export function reportTokens(req: WriteReportRequest): Record<string, { value: string; meaning: string }> {
  const t: Record<string, { value: string; meaning: string }> = {
    "site.address": { value: req.address, meaning: "site address" },
    "site.parcelId": { value: req.parcelId, meaning: "cadastral parcel id" },
    "site.parcelArea": { value: fmtM2(req.parcelAreaM2), meaning: "parcel area" },
  };
  for (const f of CONSTRAINT_FIELDS) {
    if (f.kind !== "number" && f.kind !== "list") continue;
    const field = getField(req.constraints, f.path);
    if (!field || field.value === null) continue;
    t[`rule.${f.path}`] = { value: formatValue(f, field.value), meaning: `${f.label} (${field.prov.status.replace("_", " ")})` };
  }
  for (const o of req.options) {
    const m = o.metrics;
    const add = (key: string, value: string, meaning: string) => (t[`${o.id}.${key}`] = { value, meaning: `option ${o.id} ${meaning}` });
    add("footprint", fmtM2(m.footprint), "footprint");
    add("gfa", fmtM2(m.gfa), "gross floor area");
    add("far", fmtRatio(m.far), "floor area ratio");
    add("coverage", fmtRatio(m.coverage), "coverage (0–1)");
    add("height", fmtM(m.height), "height");
    add("floors", String(m.floors), "floors");
    add("units", String(m.estUnits), "estimated units");
    add("sun", fmtRatio(m.facadeSunScore), "facade sun score (0–1)");
  }
  return t;
}

/** Rejects digits outside tokens and unknown tokens, then fills the tokens in. Exported for tests. */
export function finishReport(answer: ReportWire, req: WriteReportRequest): { data: WriteReportResult } | { errors: string[] } {
  const tokens = reportTokens(req);
  const errors: string[] = [];
  for (const id of REPORT_SECTION_IDS) {
    const n = answer.sections.filter((s) => s.id === id).length;
    if (n !== 1) errors.push(`Section "${id}" appears ${n} times; write each section exactly once.`);
  }
  answer.sections.forEach((s, i) => {
    for (const [, name] of s.text.matchAll(TOKEN)) if (!tokens[name!]) errors.push(`sections.${i}: unknown token {{${name}}}.`);
    const bare = s.text.replace(TOKEN, "");
    if (hasDigits(bare)) errors.push(`sections.${i}.text has a number outside a {{token}}. Use the tokens for every number.`);
  });
  errors.push(...digitErrors(answer.sections.map((s, i) => ({ where: `sections.${i}.title`, text: s.title }))));
  if (errors.length) return { errors };

  const order = (id: string) => REPORT_SECTION_IDS.indexOf(id as (typeof REPORT_SECTION_IDS)[number]);
  return {
    data: {
      sections: [...answer.sections]
        .sort((a, b) => order(a.id) - order(b.id))
        .map((s) => ({ ...s, text: s.text.replace(TOKEN, (_, name: string) => tokens[name]!.value) })),
    },
  };
}

function optionBlock(req: WriteReportRequest): string {
  return req.options
    .map((o) => [`Option ${o.id}: ${o.name}`, `Intent: ${o.intent}`, `Trade-offs: ${o.tradeOffs.join("; ")}`, ...o.clamps.map((c) => `Clamp: ${c}`)].join("\n"))
    .join("\n\n");
}

/** SPEC §7 report writer (stub until P10): narrative sections whose numbers are all filled in by code. */
export function writeReport(llm: LlmClient, req: WriteReportRequest): Promise<AiResult<WriteReportResult>> {
  const tokens = reportTokens(req);
  return callStructured(llm, {
    name: "reportWriter",
    prompt: PROMPT,
    user: render(PROMPT.user, {
      sections: REPORT_SECTION_IDS.map((id) => `- ${id}`).join("\n"),
      tokens: Object.entries(tokens)
        .map(([k, v]) => `- {{${k}}}: ${v.meaning} = ${v.value}`)
        .join("\n"),
      options: optionBlock(req),
    }),
    wire: ReportWireSchema,
    finish: (answer) => finishReport(answer, req),
    effort: "medium",
  });
}
