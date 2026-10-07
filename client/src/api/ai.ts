import type { z } from "zod";
import {
  ExtractRulesResultSchema,
  GenerateDirectionsResultSchema,
  InterpretBriefResultSchema,
  WriteReportResultSchema,
  aiResponse,
  type ExtractRulesRequest,
  type ExtractRulesResult,
  type GenerateDirectionsRequest,
  type GenerateDirectionsResult,
  type InterpretBriefRequest,
  type InterpretBriefResult,
  type WriteReportRequest,
  type WriteReportResult,
} from "@massing/shared";

/** A failed AI call, with the kind the server reported (unavailable, refusal, invalid_output, ...). */
export class AiCallError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

export type AiOk<T> = { data: T; cached: boolean };

async function call<T>(path: string, body: unknown, result: z.ZodType<T>): Promise<AiOk<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new AiCallError("The server could not be reached.", "unavailable");
  }
  const json: unknown = await res.json().catch(() => null);
  const parsed = aiResponse(result).safeParse(json);
  if (!parsed.success) throw new AiCallError(`Unexpected answer from the server (${res.status}).`, "unavailable");
  const answer = parsed.data;
  if (!answer.ok) throw new AiCallError(answer.error.message, answer.error.kind, answer.error.details);
  return { data: answer.data, cached: answer.meta.cached };
}

export const interpretBrief = (req: InterpretBriefRequest): Promise<AiOk<InterpretBriefResult>> => call("interpret-brief", req, InterpretBriefResultSchema);

export const generateDirections = (req: GenerateDirectionsRequest): Promise<AiOk<GenerateDirectionsResult>> =>
  call("generate-directions", req, GenerateDirectionsResultSchema);

export const extractRules = (req: ExtractRulesRequest): Promise<AiOk<ExtractRulesResult>> => call("extract-rules", req, ExtractRulesResultSchema);

export const writeReport = (req: WriteReportRequest): Promise<AiOk<WriteReportResult>> => call("report", req, WriteReportResultSchema);

/** One line for the UI: the message plus what failed validation, if the server said. */
export const describeError = (e: unknown): string => {
  if (e instanceof AiCallError) {
    const hint = e.kind === "unavailable" ? " (Claude unreachable, not logged in, or offline without a cached answer)" : "";
    return `${e.message}${hint}${e.details.length ? `: ${e.details.slice(0, 3).join(" · ")}` : ""}`;
  }
  return e instanceof Error ? e.message : String(e);
};
