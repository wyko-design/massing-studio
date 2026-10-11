import { LlmError, type LlmClient, type LlmRequest, type LlmResult } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 120_000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { message?: string };
};

/**
 * Calls Gemini through the REST generateContent endpoint with JSON-schema structured output.
 * The free tier works with a key from Google AI Studio (GEMINI_API_KEY). The answer is still
 * validated by the caller's zod schema, same as for Claude.
 */
export class GeminiClient implements LlmClient {
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    // Gemini rejects the "$schema" keyword that zod adds.
    const { $schema: _omit, ...schema } = req.jsonSchema;
    let res: Response;
    try {
      res = await this.fetchImpl(`${ENDPOINT}/models/${this.model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new LlmError("unavailable", `Gemini could not be reached: ${e instanceof Error ? e.message : String(e)}`);
    }

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.status === 429) throw new LlmError("unavailable", "Gemini rate limit reached (free tier). Wait a minute and try again.");
    if (res.status === 401 || res.status === 403) throw new LlmError("unavailable", "Gemini rejected the API key.");
    if (!res.ok) throw new LlmError("failed", `Gemini call failed (${res.status}): ${json.error?.message ?? "no detail"}`);

    if (json.promptFeedback?.blockReason) throw new LlmError("refusal", `Gemini blocked this request (${json.promptFeedback.blockReason}).`);
    const candidate = json.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") throw new LlmError("truncated", "The answer was cut off (max output tokens).");
    if (candidate?.finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(candidate.finishReason)) {
      throw new LlmError("refusal", `Gemini stopped (${candidate.finishReason}).`);
    }
    const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new LlmError("failed", "Gemini returned no text.");
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new LlmError("failed", "Gemini returned text that is not JSON.");
    }
    return { output, model: json.modelVersion ?? this.model, costUsd: null };
  }
}
