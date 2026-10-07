export type Effort = "low" | "medium" | "high";

/** One structured model call: a system prompt, one user message, and the JSON Schema the answer must follow. */
export type LlmRequest = {
  /** Call name, for logs and recordings. */
  name: string;
  system: string;
  user: string;
  /** JSON Schema of the answer (from the call's zod wire schema). */
  jsonSchema: Record<string, unknown>;
  effort: Effort;
};

export type LlmResult = {
  /** The parsed JSON answer. Not trusted: the caller validates it. */
  output: unknown;
  model: string;
  costUsd: number | null;
};

export type LlmErrorKind = "unavailable" | "refusal" | "truncated" | "failed";

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** The seam between the AI calls and a model provider. Tests replace it with a recorded fake. */
export interface LlmClient {
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResult>;
}
