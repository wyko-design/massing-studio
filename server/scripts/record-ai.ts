/**
 * Records real model answers for the AI tests: `npm run record:ai -w server [-- <call> ...]`.
 * Calls Claude through the Agent SDK (Claude login or ANTHROPIC_API_KEY) and writes
 * server/src/ai/__fixtures__/<call>.json = { input, steps, result }. Tests replay `steps`.
 * Uses the demo site from the committed cache (offline), so only the model call needs network.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PRIORITIES, DEFAULT_PROGRAMME, SiteSceneSchema, type Direction } from "@massing/shared";
import { createApp } from "../src/app";
import { interpretBrief } from "../src/ai/briefInterpreter";
import type { AiResult } from "../src/ai/callStructured";
import { interpretConstraints } from "../src/ai/constraintInterpreter";
import { AgentSdkClient } from "../src/ai/llm/agentSdkClient";
import type { LlmClient, LlmRequest, LlmResult } from "../src/ai/llm/types";
import { writeReport } from "../src/ai/reportWriter";
import { generateDirections } from "../src/ai/strategyGenerator";
import { SAMPLE_BRIEF, SAMPLE_EXCERPTS } from "../src/ai/__fixtures__/samples";
import { loadConfig } from "../src/config";

try {
  process.loadEnvFile();
} catch {
  // no .env: defaults apply
}

const FIXTURES = path.resolve(import.meta.dirname, "..", "src", "ai", "__fixtures__");

/** Wraps the real client and keeps every raw answer. */
class Recorder implements LlmClient {
  steps: LlmResult[] = [];
  constructor(private readonly inner: LlmClient) {}
  get model() {
    return this.inner.model;
  }
  async complete(req: LlmRequest) {
    const res = await this.inner.complete(req);
    this.steps.push(res);
    return res;
  }
}

const config = loadConfig();
const sceneRes = await createApp({ config: { ...config, cacheMode: "offline" } }).request("/api/scene");
const scene = SiteSceneSchema.parse(await sceneRes.json());
if (!scene.zoning) throw new Error("The demo scene has no zoning");
const constraints = scene.zoning.constraints;
const parcel = { ring: scene.parcel.ring, areaM2: scene.parcel.areaM2 };

const real = new AgentSdkClient(config.llmModel);
const wanted = process.argv.slice(2);
const want = (name: string) => wanted.length === 0 || wanted.includes(name);

async function record<I, T>(name: string, input: I, run: (llm: LlmClient, input: I) => Promise<AiResult<T>>): Promise<AiResult<T>> {
  const rec = new Recorder(real);
  const t = Date.now();
  const result = await run(rec, input);
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`${name}: ${result.ok ? `ok, ${result.meta.attempts} attempt(s), $${result.meta.costUsd?.toFixed(4)}` : `FAILED ${JSON.stringify(result.error)}`} in ${secs} s`);
  await writeFile(path.join(FIXTURES, `${name}.json`), JSON.stringify({ input, steps: rec.steps, result }, null, 2) + "\n");
  return result;
}

if (want("constraintInterpreter")) await record("constraintInterpreter", SAMPLE_EXCERPTS, interpretConstraints);

let programme = DEFAULT_PROGRAMME;
let priorities = DEFAULT_PRIORITIES;
let typologyHints: Direction["params"]["typology"][] = [];
if (want("briefInterpreter")) {
  const r = await record("briefInterpreter", { brief: SAMPLE_BRIEF, programme: DEFAULT_PROGRAMME, constraints }, interpretBrief);
  if (r.ok) ({ programme, priorities, typologyHints } = r.data);
}

let options: Direction[] | null = null;
if (want("strategyGenerator")) {
  const r = await record("strategyGenerator", { constraints, parcel, programme, priorities, typologyHints, brief: SAMPLE_BRIEF }, generateDirections);
  if (r.ok) options = r.data.options;
}

if (want("reportWriter") && options) {
  await record(
    "reportWriter",
    {
      address: scene.meta?.address ?? config.siteAddress,
      parcelId: scene.parcel.id,
      parcelAreaM2: scene.parcel.areaM2,
      constraints,
      options: options.map(({ id, name, intent, tradeOffs, params, clamps, metrics }) => ({ id, name, intent, tradeOffs, params, clamps, metrics })),
    },
    writeReport,
  );
}
