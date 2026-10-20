import { Hono, type Context } from "hono";
import type { z } from "zod";
import {
  ExtractRulesRequestSchema,
  GenerateDirectionsRequestSchema,
  InterpretBriefRequestSchema,
  WriteReportRequestSchema,
  type AiError,
} from "@massing/shared";
import { createAiCache } from "../ai/aiCache";
import { interpretBrief, PROMPT as BRIEF_PROMPT } from "../ai/briefInterpreter";
import type { AiResult } from "../ai/callStructured";
import { interpretConstraints, PROMPT as CONSTRAINT_PROMPT } from "../ai/constraintInterpreter";
import type { LlmClient } from "../ai/llm/types";
import { writeReport, PROMPT as REPORT_PROMPT } from "../ai/reportWriter";
import { generateDirections, PROMPT as STRATEGY_PROMPT } from "../ai/strategyGenerator";
import type { ServerConfig } from "../config";
import { CacheMissError, UpstreamError, createTextFetcher } from "../cache/diskCache";
import { loadSiteFixture } from "../providers/fixtureZoning";
import { fetchPlanExcerpts } from "../providers/nl/planText";
import { fetchPolicyExcerpt } from "../providers/nl/parkingPolicy";

const STATUS: Record<AiError["kind"], 400 | 422 | 502 | 503> = {
  bad_request: 400,
  unavailable: 503,
  refusal: 502,
  truncated: 502,
  invalid_output: 502,
};

const fail = (c: Context, error: AiError) => c.json({ ok: false, error }, STATUS[error.kind]);

async function body<S extends z.ZodType>(c: Context, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; error: AiError }> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    return { ok: false, error: { kind: "bad_request", message: "The request body is not JSON.", details: [] } };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    error: {
      kind: "bad_request",
      message: "The request does not match the schema.",
      details: parsed.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`),
    },
  };
}

const reply = <T>(c: Context, r: AiResult<T>) => (r.ok ? c.json(r) : fail(c, r.error));

/** The four LLM endpoints (SPEC §7). Only these call the model; sliders never do. */
export function aiRoutes(config: ServerConfig, llm: LlmClient) {
  const app = new Hono();
  const cache = createAiCache({ cacheRoot: config.cacheRoot, dir: config.siteId, mode: config.cacheMode });
  // The cache key includes the model and prompt version, so a new prompt never replays an old answer.
  const key = (version: string, req: unknown) => ({ model: llm.model, version, req });

  app.get("/status", (c) => c.json({ model: llm.model, cacheMode: config.cacheMode }));

  app.post("/interpret-brief", async (c) => {
    const b = await body(c, InterpretBriefRequestSchema);
    if (!b.ok) return fail(c, b.error);
    return reply(c, await cache("brief", key(BRIEF_PROMPT.version, b.data), () => interpretBrief(llm, b.data)));
  });

  app.post("/generate-directions", async (c) => {
    const b = await body(c, GenerateDirectionsRequestSchema);
    if (!b.ok) return fail(c, b.error);
    return reply(c, await cache("directions", key(STRATEGY_PROMPT.version, b.data), () => generateDirections(llm, b.data)));
  });

  app.post("/extract-rules", async (c) => {
    const b = await body(c, ExtractRulesRequestSchema);
    if (!b.ok) return fail(c, b.error);
    let excerpts = b.data.excerpts;
    const fetchText = createTextFetcher({ cacheRoot: config.cacheRoot, dir: "_adhoc", mode: config.cacheMode });
    const wantsLive = !!b.data.textRefs?.length || !!b.data.policyUrl;
    if (!excerpts && wantsLive) {
      // live data: read the plan articles the values came from and the municipal parking policy (adhoc cache, never the committed site cache)
      try {
        excerpts = [
          ...(b.data.textRefs?.length ? await fetchPlanExcerpts(fetchText, b.data.textRefs, { general: true }) : []),
          ...(b.data.policyUrl ? await fetchPolicyExcerpt(fetchText, b.data.policyUrl) : []),
        ];
      } catch (e) {
        if (e instanceof CacheMissError) return fail(c, { kind: "unavailable", message: e.message, details: [] });
        if (e instanceof UpstreamError) return fail(c, { kind: "unavailable", message: `Could not fetch the plan text (${e.status}).`, details: [] });
        throw e;
      }
    }
    excerpts ??= (await loadSiteFixture(config.sitesRoot, config.siteId))?.excerpts ?? [];
    if (excerpts.length === 0) {
      return c.json(
        {
          ok: false,
          error: {
            kind: "bad_request",
            message: wantsLive
              ? "The plan text and policy behind these rules could not be read."
              : `No plan excerpts to read: the request has none and site fixture "${config.siteId}" has none.`,
            details: [],
          },
        },
        422,
      );
    }
    return reply(c, await cache("rules", key(CONSTRAINT_PROMPT.version, excerpts), () => interpretConstraints(llm, excerpts)));
  });

  app.post("/report", async (c) => {
    const b = await body(c, WriteReportRequestSchema);
    if (!b.ok) return fail(c, b.error);
    return reply(c, await cache("report", key(REPORT_PROMPT.version, b.data), () => writeReport(llm, b.data)));
  });

  return app;
}
