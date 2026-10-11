import { describe, expect, it } from "vitest";
import { GeminiClient } from "./geminiClient";

const req = { name: "t", system: "sys", user: "usr", jsonSchema: { $schema: "x", type: "object" }, effort: "low" as const };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("GeminiClient", () => {
  it("sends the key, schema without $schema, and parses the JSON text", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"a":1}' }] } }], modelVersion: "gemini-x" }));
    }) as unknown as typeof fetch;
    const r = await new GeminiClient("gemini-3.8-flash", "KEY", f).complete(req);
    expect(r).toEqual({ output: { a: 1 }, model: "gemini-x", costUsd: null });
    expect(seen!.url).toContain("/models/gemini-3.8-flash:generateContent");
    expect((seen!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.generationConfig.responseJsonSchema).toEqual({ type: "object" });
  });

  it("maps rate limit, bad key, block and truncation to LlmError kinds", async () => {
    const run = (status: number, body: unknown) => new GeminiClient("m", "k", reply(status, body)).complete(req);
    await expect(run(429, {})).rejects.toMatchObject({ kind: "unavailable" });
    await expect(run(403, {})).rejects.toMatchObject({ kind: "unavailable" });
    await expect(run(200, { promptFeedback: { blockReason: "SAFETY" } })).rejects.toMatchObject({ kind: "refusal" });
    await expect(run(200, { candidates: [{ finishReason: "MAX_TOKENS" }] })).rejects.toMatchObject({ kind: "truncated" });
    await expect(run(200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "nope" }] } }] })).rejects.toMatchObject({ kind: "failed" });
  });
});
