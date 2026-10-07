import { mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROGRAMME, aiResponse, InterpretBriefResultSchema, type InterpretBriefRequest } from "@massing/shared";
import { createApp } from "../app";
import { loadConfig, type ServerConfig } from "../config";
import { FakeLlmClient, type FakeStep } from "../ai/llm/fakeClient";
import { SAMPLE_EXCERPTS } from "../ai/__fixtures__/samples";
import briefRecording from "../ai/__fixtures__/briefInterpreter.json";
import rulesRecording from "../ai/__fixtures__/constraintInterpreter.json";

/** Each test gets its own cache directory, so AI answers never land in data/cache. */
function setup(steps: FakeStep[], env: Record<string, string> = {}) {
  const base = loadConfig({ SITE_ID: "demo", ...env });
  const config: ServerConfig = { ...base, cacheRoot: mkdtempSync(path.join(os.tmpdir(), "massing-ai-")) };
  const llm = new FakeLlmClient(steps);
  return { app: createApp({ config, llm }), llm, config };
}

const post = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const briefReq = briefRecording.input as InterpretBriefRequest;
const briefSteps = briefRecording.steps as FakeStep[];

describe("AI routes", () => {
  it("reports the model and cache mode", async () => {
    const { app } = setup([]);
    expect(await (await app.request("/api/ai/status")).json()).toEqual({ model: "fake-model", cacheMode: "readwrite" });
  });

  it("interprets a brief and returns the shared response shape", async () => {
    const { app, llm } = setup(briefSteps);
    const res = await app.request("/api/ai/interpret-brief", post(briefReq));
    expect(res.status).toBe(200);
    const body = aiResponse(InterpretBriefResultSchema).parse(await res.json());
    expect(body).toMatchObject({ ok: true, meta: { promptVersion: "briefInterpreter.v1", attempts: 1, cached: false } });
    expect(llm.requests[0]!.user).toContain(briefReq.brief);
  });

  it("rejects a malformed body without calling the model", async () => {
    const { app, llm } = setup([]);
    const res = await app.request("/api/ai/interpret-brief", post({ brief: "", programme: DEFAULT_PROGRAMME }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { kind: "bad_request", details: [expect.stringContaining("brief")] } });
    expect((await app.request("/api/ai/interpret-brief", { method: "POST", body: "not json" })).status).toBe(400);
    expect(llm.requests).toHaveLength(0);
  });

  it("maps an unreachable model to 503", async () => {
    const { app } = setup([{ error: "unavailable", message: "Claude is unavailable (authentication failed)." }]);
    const res = await app.request("/api/ai/interpret-brief", post(briefReq));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: { kind: "unavailable", message: "Claude is unavailable (authentication failed).", details: [] } });
  });

  it("maps a twice-invalid answer to 502", async () => {
    const { app } = setup([{ output: {}, model: "m", costUsd: 0 }, { output: {}, model: "m", costUsd: 0 }]);
    const res = await app.request("/api/ai/interpret-brief", post(briefReq));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: { kind: "invalid_output" } });
  });

  it("needs plan excerpts to extract rules", async () => {
    const { app } = setup([]);
    const res = await app.request("/api/ai/extract-rules", post({}));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: { message: expect.stringContaining('"demo" has none') } });
  });

  it("extracts rules from excerpts in the body", async () => {
    const { app } = setup(rulesRecording.steps as FakeStep[]);
    const res = await app.request("/api/ai/extract-rules", post({ excerpts: SAMPLE_EXCERPTS }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { fields: expect.arrayContaining([expect.objectContaining({ path: "maxHeight" })]) } });
  });

  it("replays the last answer offline and fails cleanly on a miss", async () => {
    const online = setup(briefSteps);
    const first = (await (await online.app.request("/api/ai/interpret-brief", post(briefReq))).json()) as { meta: object };
    expect(readdirSync(path.join(online.config.cacheRoot, "demo")).some((f) => f.startsWith("ai-brief-"))).toBe(true);

    const offlineApp = createApp({ config: { ...online.config, cacheMode: "offline" }, llm: new FakeLlmClient([]) });
    const replay = (await (await offlineApp.request("/api/ai/interpret-brief", post(briefReq))).json()) as typeof first;
    expect(replay).toEqual({ ...first, meta: { ...first.meta, costUsd: null, cached: true } });

    const miss = await offlineApp.request("/api/ai/interpret-brief", post({ ...briefReq, brief: "something else" }));
    expect(miss.status).toBe(503);
    expect(await miss.json()).toMatchObject({ ok: false, error: { kind: "unavailable", message: expect.stringContaining("offline") } });
  });
});
