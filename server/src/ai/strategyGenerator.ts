import { z } from "zod";
import {
  MassingParamsSchema,
  OPTION_COLOURS,
  TYPOLOGY_LABELS,
  clampToRanges,
  digitErrors,
  envelopeFacts,
  generateMassing,
  resolveEnvelope,
  type GenerateDirectionsRequest,
  type GenerateDirectionsResult,
  type Typology,
} from "@massing/shared";
import { callStructured, type AiResult } from "./callStructured";
import {
  IMPLEMENTED_TYPOLOGIES,
  constraintSummary,
  factsSummary,
  prioritiesSummary,
  programmeSummary,
  rangesSummary,
  typologyList,
} from "./context";
import type { LlmClient } from "./llm/types";
import { loadPrompt, render } from "./prompts";

export const PROMPT = loadPrompt("strategyGenerator", "v2");

export const StrategyWireSchema = z.object({
  option: z.object({
    name: z.string(),
    intent: z.string(),
    tradeOffs: z.array(z.string()),
    params: z.object({
      typology: z.enum(IMPLEMENTED_TYPOLOGIES as [string, ...string[]]),
      floors: z.number().int(),
      groundFloorHeight: z.number(),
      floorHeight: z.number(),
      depth: z.number(),
      alignment: z.enum(["street", "sun"]),
      coverageTarget: z.number(),
      roof: z.enum(["flat", "pitched"]),
    }),
  }),
});
export type StrategyWire = z.infer<typeof StrategyWireSchema>;

/**
 * Checks the custom option, clamps it to the input ranges and realises it with the deterministic
 * generator. Exported for tests.
 */
export function finishStrategy(answer: StrategyWire, req: GenerateDirectionsRequest): { data: GenerateDirectionsResult } | { errors: string[] } {
  const o = answer.option;
  const errors = digitErrors([
    { where: "option.name", text: o.name },
    { where: "option.intent", text: o.intent },
    ...o.tradeOffs.map((text, j) => ({ where: `option.tradeOffs.${j}`, text })),
  ]);
  const parsed = MassingParamsSchema.safeParse({ ...o.params, colour: OPTION_COLOURS.custom });
  if (!parsed.success) errors.push(...parsed.error.issues.map((e) => `option.params.${e.path.join(".")}: ${e.message}`));
  if (errors.length || !parsed.success) return { errors };

  const envelope = resolveEnvelope(req.parcel.ring, req.constraints);
  const ranged = clampToRanges(parsed.data);
  const result = generateMassing(envelope, req.constraints, ranged.params, { parcelArea: req.parcel.areaM2, programme: req.programme });
  const option = {
    id: "custom" as const,
    name: o.name,
    intent: o.intent,
    tradeOffs: o.tradeOffs,
    params: ranged.params,
    clamps: [...ranged.clamps, ...result.clamps],
    metrics: result.metrics,
    compliance: result.compliance,
  };
  const warnings = result.metrics.footprint === 0 ? ["The custom option does not fit the envelope at all; nothing is built."] : [];
  return { data: { option, warnings } };
}

const hintLine = (hints: Typology[] | undefined) =>
  hints?.length ? hints.map((h) => `${h} (${TYPOLOGY_LABELS[h]})`).join(", ") : "none";

/** SPEC §7 strategy generator: site facts + programme + priorities → one realised custom option. */
export function generateDirections(llm: LlmClient, req: GenerateDirectionsRequest): Promise<AiResult<GenerateDirectionsResult>> {
  const envelope = resolveEnvelope(req.parcel.ring, req.constraints);
  const facts = envelopeFacts(envelope, req.constraints, req.parcel.areaM2, req.programme);
  return callStructured(llm, {
    name: "strategyGenerator",
    prompt: PROMPT,
    user: render(PROMPT.user, {
      facts: factsSummary(facts),
      constraints: constraintSummary(req.constraints),
      programme: programmeSummary(req.programme),
      priorities: prioritiesSummary(req.priorities),
      hints: hintLine(req.typologyHints),
      brief: req.brief?.trim() || "(no brief given)",
      typologies: typologyList(),
      ranges: rangesSummary(),
    }),
    wire: StrategyWireSchema,
    finish: (answer) => finishStrategy(answer, req),
    effort: "medium",
  });
}
