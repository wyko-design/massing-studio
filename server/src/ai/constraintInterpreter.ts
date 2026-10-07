import { z } from "zod";
import {
  EXTRACTABLE_PATHS,
  ExtractablePathSchema,
  digitErrors,
  fieldByPath,
  isVerbatim,
  quoteStatesValue,
  type ExtractRulesResult,
  type ExtractablePath,
  type PlanExcerpt,
} from "@massing/shared";
import { callStructured, type AiResult } from "./callStructured";
import type { LlmClient } from "./llm/types";
import { loadPrompt, render } from "./prompts";

export const PROMPT = loadPrompt("constraintInterpreter", "v1");

export const ConstraintWireSchema = z.object({
  fields: z.array(
    z.object({
      path: ExtractablePathSchema,
      value: z.union([z.number(), z.array(z.string())]),
      quote: z.string(),
      excerptIndex: z.number().int(),
    }),
  ),
  notes: z.array(z.object({ text: z.string(), quote: z.string(), excerptIndex: z.number().int() })),
});
export type ConstraintWire = z.infer<typeof ConstraintWireSchema>;

/** Plausible bounds per numeric field. A value outside is a misreading, not a rule. */
const BOUNDS: Partial<Record<ExtractablePath, [number, number]>> = {
  maxHeight: [2, 200],
  maxGutterHeight: [2, 200],
  "setbacks.street": [0, 100],
  "setbacks.side": [0, 100],
  "setbacks.rear": [0, 100],
  maxCoverage: [0.01, 1],
  maxFAR: [0.01, 20],
  parkingNorm: [0, 5],
};

function fieldList(): string {
  return EXTRACTABLE_PATHS.map((p) => {
    const f = fieldByPath(p);
    const type = f.kind === "list" ? "list of strings" : "number";
    return `- ${p}: ${f.label}${f.term ? ` (${f.term})` : ""}; ${type}${f.unit ? `, in ${f.unit}` : ""}`;
  }).join("\n");
}

const excerptBlock = (excerpts: PlanExcerpt[]) =>
  excerpts.map((e, i) => `<excerpt index="${i}" title="${e.title}" url="${e.url}">\n${e.text}\n</excerpt>`).join("\n");

/** Checks the answer against the plan text and turns it into extracted constraints. Exported for tests. */
export function finishExtraction(answer: ConstraintWire, excerpts: PlanExcerpt[]): { data: ExtractRulesResult } | { errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  const sourceOf = (i: number) => `${excerpts[i]!.title} (${excerpts[i]!.url})`;
  const quoteOk = (where: string, quote: string, i: number) => {
    if (i < 0 || i >= excerpts.length) {
      errors.push(`${where}: excerptIndex ${i} does not exist (0–${excerpts.length - 1}).`);
      return false;
    }
    if (!isVerbatim(quote, excerpts[i]!.text)) {
      errors.push(`${where}: the quote "${quote}" is not verbatim text of excerpt ${i}. Copy the rule text exactly.`);
      return false;
    }
    return true;
  };

  for (const f of answer.fields) {
    const where = `fields.${f.path}`;
    if (seen.has(f.path)) errors.push(`${where}: given more than once; give each field once.`);
    seen.add(f.path);
    if (!quoteOk(where, f.quote, f.excerptIndex)) continue;
    const kind = fieldByPath(f.path).kind;
    if (kind === "list") {
      if (!Array.isArray(f.value) || f.value.length === 0) errors.push(`${where}: must be a non-empty list of strings.`);
      continue;
    }
    if (typeof f.value !== "number") {
      errors.push(`${where}: must be a number.`);
      continue;
    }
    if (!quoteStatesValue(f.quote, f.value)) {
      errors.push(`${where}: the value ${f.value} is not written in its quote "${f.quote}". Quote the text that states the number.`);
    }
    const b = BOUNDS[f.path];
    if (b && (f.value < b[0] || f.value > b[1])) errors.push(`${where}: ${f.value} is outside the plausible range ${b[0]}–${b[1]}.`);
  }
  answer.notes.forEach((n, i) => quoteOk(`notes.${i}`, n.quote, n.excerptIndex));
  errors.push(...digitErrors(answer.notes.map((n, i) => ({ where: `notes.${i}.text`, text: n.text }))));
  if (errors.length) return { errors };

  return {
    data: {
      fields: answer.fields.map((f) => {
        const unit = fieldByPath(f.path).unit;
        return {
          path: f.path,
          constrained: {
            value: f.value,
            ...(unit ? { unit } : {}),
            prov: { source: sourceOf(f.excerptIndex), quote: f.quote, status: "extracted" as const },
          },
        };
      }),
      notes: answer.notes.map((n) => ({
        value: n.text,
        prov: { source: sourceOf(n.excerptIndex), quote: n.quote, status: "extracted" as const },
      })),
    },
  };
}

/** SPEC §7 constraint interpreter: plan excerpts → extracted constraint values with verbatim quotes. */
export function interpretConstraints(llm: LlmClient, excerpts: PlanExcerpt[]): Promise<AiResult<ExtractRulesResult>> {
  return callStructured(llm, {
    name: "constraintInterpreter",
    prompt: PROMPT,
    user: render(PROMPT.user, { fields: fieldList(), excerpts: excerptBlock(excerpts) }),
    wire: ConstraintWireSchema,
    finish: (answer) => finishExtraction(answer, excerpts),
    effort: "medium",
  });
}
