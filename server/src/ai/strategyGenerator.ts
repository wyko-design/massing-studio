import { z } from "zod";
import {
  MassingParamsSchema,
  OPTION_COLOURS,
  OPTION_IDS,
  TYPOLOGY_LABELS,
  clampToRanges,
  contrastIssues,
  digitErrors,
  envelopeFacts,
  generateMassing,
  resolveEnvelope,
  realisedIssues,
  type Direction,
  type GenerateDirectionsRequest,
  type GenerateDirectionsResult,
  type MassingParams,
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

export const PROMPT = loadPrompt("strategyGenerator", "v1");

export const StrategyWireSchema = z.object({
  options: z.array(
    z.object({
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
  ),
});
export type StrategyWire = z.infer<typeof StrategyWireSchema>;

/**
 * Checks the three options, clamps them to the input ranges and realises each with the
 * deterministic generator. Near-identical results go back to the model once; on the retry they
 * are returned with a warning (a small plot can leave little room for contrast). Exported for tests.
 */
export function finishStrategy(
  answer: StrategyWire,
  req: GenerateDirectionsRequest,
  attempt: number,
): { data: GenerateDirectionsResult } | { errors: string[] } {
  if (answer.options.length !== 3) return { errors: [`Return exactly three options, not ${answer.options.length}.`] };
  const errors = digitErrors(
    answer.options.flatMap((o, i) => [
      { where: `options.${i}.name`, text: o.name },
      { where: `options.${i}.intent`, text: o.intent },
      ...o.tradeOffs.map((text, j) => ({ where: `options.${i}.tradeOffs.${j}`, text })),
    ]),
  );

  const requested: { id: (typeof OPTION_IDS)[number]; value: MassingParams }[] = [];
  answer.options.forEach((o, i) => {
    const id = OPTION_IDS[i]!;
    const parsed = MassingParamsSchema.safeParse({ ...o.params, colour: OPTION_COLOURS[id] });
    if (!parsed.success) errors.push(...parsed.error.issues.map((e) => `options.${i}.params.${e.path.join(".")}: ${e.message}`));
    else requested.push({ id, value: parsed.data });
  });
  if (requested.length === 3) errors.push(...contrastIssues(requested));
  if (errors.length) return { errors };

  const envelope = resolveEnvelope(req.parcel.ring, req.constraints);
  const site = { parcelArea: req.parcel.areaM2, programme: req.programme };
  const options: Direction[] = requested.map(({ id, value }, i) => {
    const o = answer.options[i]!;
    const ranged = clampToRanges(value);
    const result = generateMassing(envelope, req.constraints, ranged.params, site);
    return {
      id,
      name: o.name,
      intent: o.intent,
      tradeOffs: o.tradeOffs,
      params: ranged.params,
      clamps: [...ranged.clamps, ...result.clamps],
      metrics: result.metrics,
      compliance: result.compliance,
    };
  });

  const close = realisedIssues(options.map((o) => ({ id: o.id, value: o.metrics })));
  const empty = options.filter((o) => o.metrics.footprint === 0).map((o) => `Option ${o.id} does not fit the envelope at all; nothing is built.`);
  if (attempt === 1 && close.length) {
    return {
      errors: [
        ...close,
        "The site clamps these options to almost the same building. Use the envelope facts to choose parameters that stay different after clamping.",
      ],
    };
  }
  return { data: { options, warnings: [...close, ...empty] } };
}

const hintLine = (hints: Typology[] | undefined) =>
  hints?.length ? hints.map((h) => `${h} (${TYPOLOGY_LABELS[h]})`).join(", ") : "none";

/** SPEC §7 strategy generator: site facts + programme + priorities → three contrasting, realised options. */
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
    finish: (answer, attempt) => finishStrategy(answer, req, attempt),
    effort: "medium",
  });
}
