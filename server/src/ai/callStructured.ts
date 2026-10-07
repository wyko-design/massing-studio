import { z } from "zod";
import type { AiError, AiMeta } from "@massing/shared";
import { LlmError, type Effort, type LlmClient } from "./llm/types";
import type { Prompt } from "./prompts";

export type AiResult<T> = { ok: true; data: T; meta: AiMeta } | { ok: false; error: AiError };

export type StructuredCall<W, T> = {
  name: string;
  prompt: Prompt;
  /** The rendered user message (numbers in it come from code). */
  user: string;
  /** Shape of the model's answer; sent as JSON Schema and re-checked here. */
  wire: z.ZodType<W>;
  /**
   * Semantic checks plus the step from answer to result (clamping, realising the massing).
   * Returns the result, or the errors the model is asked to fix in its one retry.
   */
  finish: (answer: W, attempt: number) => { data: T } | { errors: string[] };
  effort: Effort;
};

const ERROR_KIND: Record<LlmError["kind"], AiError["kind"]> = {
  unavailable: "unavailable",
  refusal: "refusal",
  truncated: "truncated",
  failed: "unavailable",
};

const issuesOf = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(answer)"}: ${i.message}`);

function retryMessage(user: string, previous: unknown, errors: string[]): string {
  return [
    user,
    "",
    "<previous_answer>",
    JSON.stringify(previous),
    "</previous_answer>",
    "<validation_errors>",
    ...errors.map((e) => `- ${e}`),
    "</validation_errors>",
    "Your previous answer failed these checks. Return a corrected answer that passes all of them.",
  ].join("\n");
}

/** JSON Schema for the model; zod checks the answer again afterwards, refinements included. */
export const jsonSchemaOf = (wire: z.ZodType) => z.toJSONSchema(wire, { target: "draft-7", io: "input" }) as Record<string, unknown>;

/** Call the model, validate the answer, retry once with the errors. Model problems never throw. */
export async function callStructured<W, T>(llm: LlmClient, call: StructuredCall<W, T>): Promise<AiResult<T>> {
  const jsonSchema = jsonSchemaOf(call.wire);
  let user = call.user;
  let errors: string[] = [];
  let cost = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let output: unknown;
    let model: string;
    try {
      const res = await llm.complete({ name: call.name, system: call.prompt.system, user, jsonSchema, effort: call.effort });
      output = res.output;
      model = res.model;
      cost += res.costUsd ?? 0;
    } catch (e) {
      if (e instanceof LlmError) return { ok: false, error: { kind: ERROR_KIND[e.kind], message: e.message, details: [] } };
      throw e;
    }
    const parsed = call.wire.safeParse(output);
    const finished = parsed.success ? call.finish(parsed.data, attempt) : { errors: issuesOf(parsed.error) };
    if ("data" in finished) {
      return {
        ok: true,
        data: finished.data,
        meta: { model, promptVersion: call.prompt.version, attempts: attempt, costUsd: cost, cached: false },
      };
    }
    errors = finished.errors;
    user = retryMessage(call.user, output, errors);
  }
  return {
    ok: false,
    error: { kind: "invalid_output", message: `The ${call.name} answer failed validation twice.`, details: errors },
  };
}
