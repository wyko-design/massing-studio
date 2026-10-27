import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { GenerateDirectionsRequest, InterpretBriefRequest, PlanExcerpt, WriteReportRequest } from "@massing/shared";
import { finishBrief, interpretBrief, type BriefWire } from "./briefInterpreter";
import type { AiResult } from "./callStructured";
import { finishExtraction, interpretConstraints, type ConstraintWire } from "./constraintInterpreter";
import { FakeLlmClient, answer } from "./llm/fakeClient";
import type { LlmResult } from "./llm/types";
import { finishReport, writeReport, type ReportWire } from "./reportWriter";
import { finishStrategy, generateDirections, type StrategyWire } from "./strategyGenerator";

/** A real recorded run (scripts/record-ai.ts): the input, the raw model answers, the result. */
type Recording<I> = { input: I; steps: LlmResult[]; result: AiResult<unknown> };
const recording = <I>(name: string): Recording<I> =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", `${name}.json`), "utf8")) as Recording<I>;

const clone = <T>(x: T): T => structuredClone(x);
const errorsOf = (r: { errors: string[] } | { data: unknown }) => ("errors" in r ? r.errors : []);

describe("constraintInterpreter", () => {
  const rec = recording<PlanExcerpt[]>("constraintInterpreter");
  const wire = rec.steps[0]!.output as ConstraintWire;

  it("replays the recorded answer into extracted constraints", async () => {
    const r = await interpretConstraints(new FakeLlmClient(rec.steps), rec.input);
    expect(r).toEqual(rec.result);
    if (!r.ok) throw new Error("expected ok");
    const height = r.data.fields.find((f) => f.path === "maxHeight")!.constrained;
    expect(height).toMatchObject({ value: 13, unit: "m", prov: { status: "extracted" } });
    expect(rec.input[0]!.text).toContain(height.prov.quote!);
    // 60% in the plan text becomes 0.6
    expect(r.data.fields.find((f) => f.path === "maxCoverage")!.constrained.value).toBe(0.6);
  });

  it("rejects a quote that is not in the plan text", () => {
    const bad = clone(wire);
    bad.fields[0]!.quote = "De gronden zijn bestemd voor kantoren.";
    expect(errorsOf(finishExtraction(bad, rec.input))[0]).toMatch(/is not verbatim text of excerpt/);
  });

  it("rejects a number that its quote does not state", () => {
    const bad = clone(wire);
    bad.fields.find((f) => f.path === "maxHeight")!.value = 15;
    expect(errorsOf(finishExtraction(bad, rec.input))).toEqual([expect.stringContaining("fields.maxHeight: the value 15 is not written in its quote")]);
  });

  it("rejects implausible values, bad excerpt indexes and digits in notes", () => {
    const bad = clone(wire);
    bad.fields.push({ path: "maxFAR", value: 60, quote: "ten hoogste 60%", excerptIndex: 0 });
    bad.notes[0]!.excerptIndex = 9;
    bad.notes[1]!.text = "Build within 3 m of the line";
    const errors = errorsOf(finishExtraction(bad, rec.input));
    expect(errors).toEqual([
      expect.stringContaining("fields.maxFAR: 60 is outside the plausible range"),
      expect.stringContaining("notes.0: excerptIndex 9 does not exist"),
      expect.stringContaining("notes.1.text contains a number"),
    ]);
  });

  it("retries a fabricated answer once, then fails with the reasons", async () => {
    const bad = clone(wire);
    bad.fields[1]!.quote = "maximaal 99 m";
    const llm = new FakeLlmClient([answer(bad), answer(bad)]);
    const r = await interpretConstraints(llm, rec.input);
    expect(r).toMatchObject({ ok: false, error: { kind: "invalid_output" } });
    expect(llm.requests[1]!.user).toContain("<validation_errors>");
  });
});

describe("briefInterpreter", () => {
  const rec = recording<InterpretBriefRequest>("briefInterpreter");
  const wire = rec.steps[0]!.output as BriefWire;

  it("replays the recorded answer into programme, priorities and hints", async () => {
    const r = await interpretBrief(new FakeLlmClient(rec.steps), rec.input);
    expect(r).toEqual(rec.result);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.typologyHints).not.toContain("courtyard"); // the brief says "no courtyard"
    for (const c of r.data.changes) expect(rec.input.brief).toContain(c.briefQuote);
  });

  it("keeps values the brief does not set and clamps out-of-range ones", () => {
    const w = clone(wire);
    w.programme = { targetUnits: { value: 40, briefQuote: "around 14 homes" }, avgUnitSize: null, netToGross: null };
    const r = finishBrief(w, rec.input);
    if (!("data" in r)) throw new Error(r.errors.join("\n"));
    expect(r.data.programme).toEqual({ ...rec.input.programme, targetUnits: 25 });
    expect(r.data.clamps).toEqual(["Brief asked for target units 40; the input range allows 25."]);
  });

  it("rejects invented brief quotes and digits in the summary", () => {
    const w = clone(wire);
    w.programme.netToGross = { value: 0.8, briefQuote: "efficient floor plans" };
    w.summary = "About 14 homes.";
    expect(errorsOf(finishBrief(w, rec.input))).toEqual([
      expect.stringContaining("programme.netToGross: the briefQuote"),
      expect.stringContaining("summary contains a number"),
    ]);
  });
});

describe("strategyGenerator", () => {
  // the v1 recording's first option, replayed as the v2 one-option answer
  const rec = recording<GenerateDirectionsRequest>("strategyGenerator");
  const wire = rec.steps[0]!.output as StrategyWire;

  it("replays the recorded answer into one realised custom option", async () => {
    const r = await generateDirections(new FakeLlmClient(rec.steps), rec.input);
    expect(r).toEqual(rec.result);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.option.id).toBe("custom");
    expect(r.data.option.params.colour).toBe("#7a4fb0");
    expect(r.data.option.metrics.footprint).toBeGreaterThan(0);
  });

  it("clamps out-of-range params and records generator clamps", () => {
    const w = clone(wire);
    w.option.params = { ...w.option.params, depth: 45, floors: 9 };
    const r = finishStrategy(w, rec.input);
    if (!("data" in r)) throw new Error(r.errors.join("\n"));
    const a = r.data.option;
    expect(a.params.depth).toBe(40);
    expect(a.clamps[0]).toBe("AI asked for depth 45 m; the input range allows 40 m.");
    expect(a.clamps.some((c) => /^Asked for 9 floors; max height/.test(c))).toBe(true);
  });

  it("rejects digits in the text", () => {
    const w = clone(wire);
    w.option.intent = "Twelve homes, or 12 to be exact.";
    expect(errorsOf(finishStrategy(w, rec.input))[0]).toContain("option.intent contains a number");
  });
});

describe("reportWriter", () => {
  const rec = recording<WriteReportRequest>("reportWriter");
  const wire = rec.steps[0]!.output as ReportWire;

  it("replays the recorded answer and fills every number from computed values", async () => {
    const r = await writeReport(new FakeLlmClient(rec.steps), rec.input);
    expect(r).toEqual(rec.result);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.sections.map((s) => s.id)).toEqual(["site", "constraints", "options", "comparison", "limitations"]);
    expect(r.data.sections.every((s) => !s.text.includes("{{"))).toBe(true);
    // every model section was written with tokens only, never with typed digits
    for (const s of wire.sections) expect(/\d/.test(s.text.replace(/\{\{[\w.]+\}\}/g, ""))).toBe(false);
  });

  it("rejects typed numbers, unknown tokens and missing sections", () => {
    const w = clone(wire);
    w.sections[0]!.text = "The parcel is 111 m².";
    w.sections[1]!.text = "Height is {{rule.maxDepth}}.";
    w.sections.pop();
    expect(errorsOf(finishReport(w, rec.input))).toEqual([
      'Section "limitations" appears 0 times; write each section exactly once.',
      expect.stringContaining("sections.0.text has a number outside a {{token}}"),
      "sections.1: unknown token {{rule.maxDepth}}.",
    ]);
  });
});
