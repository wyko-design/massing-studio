import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROGRAMME, aiResponse, InterpretBriefResultSchema, type InterpretBriefRequest } from "@massing/shared";
import { createApp } from "../app";
import { loadConfig, type ServerConfig } from "../config";
import { FakeLlmClient, answer, type FakeStep } from "../ai/llm/fakeClient";
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

  describe("rules from live plan text", () => {
    const url = "https://ruimtelijkeplannen.nl/documents/NL.IMRO.0503.BP0005-2001/r_NL.IMRO.0503.BP0005-2001_2.3.html";
    const html = readFileSync(path.join(import.meta.dirname, "..", "providers", "nl", "__fixtures__", "rp-text-bp0005-2.3.html"), "utf8");
    const wire = {
      fields: [{ path: "maxHeight", value: 5.5, quote: "de bouwhoogte oploopt van maximaal 5,5 m", excerptIndex: 0 }],
      notes: [],
    };

    it("fetches the linked plan article and extracts from it", async () => {
      const fetched: string[] = [];
      const chapter = (n: number, article: number, name: string) =>
        `<html><body><a href="r_NL.IMRO.0503.BP0005-2001_${n}.${article}.html">Artikel ${article} ${name}</a></body></html>`;
      vi.stubGlobal("fetch", async (u: string) => {
        fetched.push(u);
        if (u.endsWith("_3.html")) return new Response(chapter(3, 20, "Algemene bouwregels"), { status: 200 });
        if (u.endsWith("_1.html")) return new Response(chapter(1, 2, "Wijze van meten"), { status: 200 });
        return new Response(html, { status: 200 });
      });
      try {
        const { app, llm } = setup([answer(wire)]);
        const res = await app.request("/api/ai/extract-rules", post({ textRefs: [{ title: "Bedrijventerrein, Plan", url }] }));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { fields: { path: string; constrained: { prov: { source: string; status: string } } }[] } };
        expect(body.data.fields[0]).toMatchObject({ path: "maxHeight", constrained: { prov: { status: "extracted" } } });
        expect(body.data.fields[0]!.constrained.prov.source).toContain("Bedrijventerrein");
        expect(fetched[0]).toBe(url);
        // the general articles of the same plan are read too
        expect(fetched.some((u) => u.endsWith("_3.20.html"))).toBe(true);
        expect(fetched.some((u) => u.endsWith("_1.2.html"))).toBe(true);
        expect(llm.requests[0]!.user).toContain("de bouwhoogte oploopt van maximaal 5,5 m");
        expect(llm.requests[0]!.user).toContain("Algemene bouwregels");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("reads the municipal parking policy when its url is sent, and only from the official repository", async () => {
      const fetched: string[] = [];
      const xml = "<tekst><p>Algemeen.</p><p>Voor een woning geldt een parkeernorm van 1,5 parkeerplaats per woning.</p></tekst>";
      vi.stubGlobal("fetch", async (u: string) => {
        fetched.push(u);
        return new Response(xml, { status: 200 });
      });
      try {
        const policyUrl = "https://repository.officiele-overheidspublicaties.nl/cvdr/CVDR714401/1/xml/CVDR714401_1.xml";
        const ok = setup([answer({ fields: [{ path: "parkingNorm", value: 1.5, quote: "een parkeernorm van 1,5 parkeerplaats per woning", excerptIndex: 0 }], notes: [] })]);
        const res = await ok.app.request("/api/ai/extract-rules", post({ policyUrl }));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ ok: true, data: { fields: [{ path: "parkingNorm", constrained: { value: 1.5 } }] } });
        expect(fetched).toEqual([policyUrl]);
        expect(ok.llm.requests[0]!.user).toContain("parkeernorm van 1,5");

        fetched.length = 0;
        const foreign = await setup([]).app.request("/api/ai/extract-rules", post({ policyUrl: "https://evil.example/cvdr/CVDR1/1/xml/CVDR1_1.xml" }));
        expect(foreign.status).toBe(422);
        expect(fetched).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("never fetches links outside ruimtelijkeplannen.nl", async () => {
      const fetched: string[] = [];
      vi.stubGlobal("fetch", async (u: string) => {
        fetched.push(u);
        return new Response("x", { status: 200 });
      });
      try {
        const { app } = setup([]);
        const res = await app.request("/api/ai/extract-rules", post({ textRefs: [{ title: "x", url: "https://evil.example/documents/X/r_X.html" }] }));
        expect(res.status).toBe(422);
        expect(fetched).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("answers 503 when the plan text cannot be fetched", async () => {
      vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));
      try {
        const { app } = setup([]);
        const res = await app.request("/api/ai/extract-rules", post({ textRefs: [{ title: "x", url }] }));
        expect(res.status).toBe(503);
      } finally {
        vi.unstubAllGlobals();
      }
    });
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
