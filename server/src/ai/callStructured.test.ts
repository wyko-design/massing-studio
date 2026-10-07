import { describe, expect, it } from "vitest";
import { z } from "zod";
import { callStructured } from "./callStructured";
import { FakeLlmClient, answer } from "./llm/fakeClient";
import { loadPrompt, render } from "./prompts";

const prompt = { version: "test.v1", system: "sys", user: "pick a number" };
const wire = z.object({ n: z.number().int() });
const call = (llm: FakeLlmClient) =>
  callStructured(llm, {
    name: "test",
    prompt,
    user: prompt.user,
    wire,
    finish: (a) => (a.n % 2 === 0 ? { data: a.n * 10 } : { errors: [`${a.n} is odd`] }),
    effort: "low",
  });

describe("callStructured", () => {
  it("returns validated data with meta on the first good answer", async () => {
    const llm = new FakeLlmClient([{ output: { n: 2 }, model: "m", costUsd: 0.01 }]);
    expect(await call(llm)).toEqual({ ok: true, data: 20, meta: { model: "m", promptVersion: "test.v1", attempts: 1, costUsd: 0.01, cached: false } });
    expect(llm.requests[0]!.jsonSchema).toMatchObject({ type: "object", required: ["n"] });
  });

  it("retries once with the errors and the previous answer", async () => {
    const llm = new FakeLlmClient([answer({ n: 3 }), answer({ n: 4 })]);
    const r = await call(llm);
    expect(r).toMatchObject({ ok: true, data: 40, meta: { attempts: 2 } });
    const retry = llm.requests[1]!.user;
    expect(retry).toContain("pick a number");
    expect(retry).toContain('{"n":3}');
    expect(retry).toContain("- 3 is odd");
  });

  it("retries on a schema failure too", async () => {
    const llm = new FakeLlmClient([answer({ n: "two" }), answer({ n: 6 })]);
    expect(await call(llm)).toMatchObject({ ok: true, data: 60 });
    expect(llm.requests[1]!.user).toContain("n: Invalid input");
  });

  it("returns a typed error after two failures", async () => {
    const llm = new FakeLlmClient([answer({ n: 1 }), answer({ n: 5 })]);
    expect(await call(llm)).toEqual({
      ok: false,
      error: { kind: "invalid_output", message: "The test answer failed validation twice.", details: ["5 is odd"] },
    });
  });

  it.each([
    ["unavailable", "unavailable"],
    ["refusal", "refusal"],
    ["truncated", "truncated"],
    ["failed", "unavailable"],
  ] as const)("maps a %s model error to %s", async (from, to) => {
    const r = await call(new FakeLlmClient([{ error: from, message: "boom" }]));
    expect(r).toEqual({ ok: false, error: { kind: to, message: "boom", details: [] } });
  });
});

describe("prompts", () => {
  it("fills every placeholder and rejects missing or unused values", () => {
    expect(render("a {{x}} b {{y}}", { x: "1", y: "2" })).toBe("a 1 b 2");
    expect(() => render("a {{x}}", {})).toThrow("{{x}}");
    expect(() => render("a", { x: "1" })).toThrow("not used");
  });

  it.each(["constraintInterpreter", "briefInterpreter", "strategyGenerator", "reportWriter"])("loads %s.v1", (name) => {
    const p = loadPrompt(name, "v1");
    expect(p.version).toBe(`${name}.v1`);
    expect(p.system.length).toBeGreaterThan(100);
    expect(p.user).toMatch(/\{\{\w+\}\}/);
  });
});
