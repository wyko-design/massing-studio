import { z } from "zod";
import {
  PrioritiesSchema,
  digitErrors,
  fitProgramme,
  isVerbatim,
  type InterpretBriefRequest,
  type InterpretBriefResult,
  type Programme,
} from "@massing/shared";
import { callStructured, type AiResult } from "./callStructured";
import { IMPLEMENTED_TYPOLOGIES, constraintSummary, programmeRangesSummary, programmeSummary, typologyList } from "./context";
import type { LlmClient } from "./llm/types";
import { loadPrompt, render } from "./prompts";

export const PROMPT = loadPrompt("briefInterpreter", "v1");

const fromBrief = <T extends z.ZodType>(value: T) => z.object({ value, briefQuote: z.string() }).nullable();

export const BriefWireSchema = z.object({
  programme: z.object({
    targetUnits: fromBrief(z.number().int()),
    avgUnitSize: fromBrief(z.number()),
    netToGross: fromBrief(z.number()),
  }),
  priorities: PrioritiesSchema,
  typologyHints: z.array(z.enum(IMPLEMENTED_TYPOLOGIES as [string, ...string[]])),
  summary: z.string(),
  unclear: z.array(z.string()),
});
export type BriefWire = z.infer<typeof BriefWireSchema>;

const PROGRAMME_KEYS = ["targetUnits", "avgUnitSize", "netToGross"] as const;

/** Checks the answer against the brief, merges it into the current programme and clamps it. Exported for tests. */
export function finishBrief(answer: BriefWire, req: InterpretBriefRequest): { data: InterpretBriefResult } | { errors: string[] } {
  const errors: string[] = [];
  for (const k of PROGRAMME_KEYS) {
    const v = answer.programme[k];
    if (v && !isVerbatim(v.briefQuote, req.brief)) {
      errors.push(`programme.${k}: the briefQuote "${v.briefQuote}" is not verbatim text of the brief. Quote the words you read it from.`);
    }
  }
  errors.push(
    ...digitErrors([
      { where: "summary", text: answer.summary },
      ...answer.unclear.map((text, i) => ({ where: `unclear.${i}`, text })),
    ]),
  );
  if (errors.length) return { errors };

  const programme: Programme = { ...req.programme };
  const changes: InterpretBriefResult["changes"] = [];
  const clamps: string[] = [];
  for (const k of PROGRAMME_KEYS) {
    const v = answer.programme[k];
    if (!v) continue;
    const fit = fitProgramme(k, v.value);
    programme[k] = fit.value;
    if (fit.clamp) clamps.push(fit.clamp);
    changes.push({ field: k, briefQuote: v.briefQuote });
  }
  return {
    data: {
      programme,
      changes,
      priorities: answer.priorities,
      typologyHints: [...new Set(answer.typologyHints)] as InterpretBriefResult["typologyHints"],
      summary: answer.summary,
      unclear: answer.unclear,
      clamps,
    },
  };
}

/** SPEC §7 brief interpreter: free-text brief → programme, priority weights and typology hints. */
export function interpretBrief(llm: LlmClient, req: InterpretBriefRequest): Promise<AiResult<InterpretBriefResult>> {
  return callStructured(llm, {
    name: "briefInterpreter",
    prompt: PROMPT,
    user: render(PROMPT.user, {
      brief: req.brief,
      programme: programmeSummary(req.programme),
      ranges: programmeRangesSummary(),
      typologies: typologyList(),
      constraints: req.constraints ? constraintSummary(req.constraints) : "- not loaded",
    }),
    wire: BriefWireSchema,
    finish: (answer) => finishBrief(answer, req),
    effort: "low",
  });
}
