import { LlmError, type LlmClient, type LlmErrorKind, type LlmRequest, type LlmResult } from "./types";

export type FakeStep = LlmResult | { error: LlmErrorKind; message?: string };

/** Replays recorded results in order and keeps every request it got. Tests never reach a model. */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  private readonly steps: FakeStep[];

  constructor(
    steps: FakeStep[],
    readonly model = "fake-model",
  ) {
    this.steps = [...steps];
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    this.requests.push(req);
    const step = this.steps.shift();
    if (!step) throw new Error(`FakeLlmClient: no recorded result left for ${req.name}`);
    if ("error" in step) throw new LlmError(step.error, step.message ?? step.error);
    return step;
  }

  get remaining(): number {
    return this.steps.length;
  }
}

/** Shorthand: a recorded answer with no cost. */
export const answer = (output: unknown): LlmResult => ({ output, model: "fake-model", costUsd: 0 });
