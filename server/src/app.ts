import { existsSync } from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { sampleScene } from "@massing/shared";
import { CacheMissError, UpstreamError, createJsonFetcher } from "./cache/diskCache";
import type { ServerConfig } from "./config";
import { Bag3dContextProvider } from "./providers/nl/bag3d";
import { KadasterParcelProvider } from "./providers/nl/kadasterParcel";
import { LocatieserverGeocoder } from "./providers/nl/locatieserver";
import { FixtureZoningProvider } from "./providers/fixtureZoning";
import { SceneError, buildScene, type SceneProviders } from "./scene";
import { AgentSdkClient } from "./ai/llm/agentSdkClient";
import { GeminiClient } from "./ai/llm/geminiClient";
import type { LlmClient } from "./ai/llm/types";
import { aiRoutes } from "./routes/ai";

export type AppDeps = {
  config: ServerConfig;
  /** Provider set for one request; `cacheDir` is the site id or "_adhoc". Overridden in tests. */
  providersFor?: (cacheDir: string) => SceneProviders;
  /** Model client for the AI routes. Defaults to Claude via the Agent SDK; tests pass a fake. */
  llm?: LlmClient;
};

const AD_HOC_DIR = "_adhoc";

function nlProviders(config: ServerConfig, cacheDir: string): SceneProviders {
  const fetchJson = createJsonFetcher({ cacheRoot: config.cacheRoot, dir: cacheDir, mode: config.cacheMode });
  const context = new Bag3dContextProvider(fetchJson);
  return {
    geocoder: new LocatieserverGeocoder(fetchJson),
    parcels: new KadasterParcelProvider(fetchJson),
    context,
    zoning: new FixtureZoningProvider(config.sitesRoot, config.siteId),
    skippedContext: () => context.lastSkipped,
  };
}

/** Gemini when LLM_PROVIDER=gemini (free tier key), otherwise Claude through the Agent SDK. */
function defaultLlm(config: ServerConfig): LlmClient {
  if (config.llmProvider === "gemini") {
    if (!config.geminiApiKey) throw new Error("LLM_PROVIDER=gemini needs GEMINI_API_KEY");
    return new GeminiClient(config.llmModel, config.geminiApiKey);
  }
  return new AgentSdkClient(config.llmModel);
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function createApp({ config, providersFor, llm }: AppDeps) {
  const app = new Hono();

  // Hosted use: one shared password for the whole site. The browser asks once and remembers it.
  if (config.accessPassword) {
    const auth = basicAuth({ username: "massing", password: config.accessPassword, realm: "Massing Studio" });
    app.use("*", (c, next) => (c.req.path === "/api/health" ? next() : auth(c, next)));
  }

  // Cap on model calls per hour (all users together); only the AI routes can spend money.
  const aiCalls: number[] = [];
  app.use("/api/ai/*", async (c, next) => {
    if (c.req.method !== "POST") return next();
    const since = Date.now() - 3_600_000;
    while (aiCalls.length && aiCalls[0]! < since) aiCalls.shift();
    if (aiCalls.length >= config.aiHourlyLimit) {
      return c.json({ ok: false, error: { kind: "unavailable", message: "The hourly AI limit is reached. Try again later.", details: [] } }, 503);
    }
    aiCalls.push(Date.now());
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  /** Hard-coded M0 scene: offline fallback and test fixture. */
  app.get("/api/scene/sample", (c) => c.json(sampleScene));

  app.get("/api/scene", async (c) => {
    const query = c.req.query("q")?.trim() || config.siteAddress;
    // Only the demo site's address writes into the (committed) site cache.
    const cacheDir = sameAddress(query, config.siteAddress) ? config.siteId : AD_HOC_DIR;
    try {
      const providers = providersFor ? providersFor(cacheDir) : nlProviders(config, cacheDir);
      return c.json(await buildScene(providers, query));
    } catch (e) {
      if (e instanceof SceneError) return c.json({ error: e.message }, e.status);
      if (e instanceof CacheMissError) return c.json({ error: e.message }, 503);
      if (e instanceof UpstreamError) return c.json({ error: e.message }, 502);
      console.error(e);
      return c.json({ error: "Could not load the site." }, 500);
    }
  });

  app.route("/api/ai", aiRoutes(config, llm ?? defaultLlm(config)));

  // Production: serve the built client from the same origin (npm run build first).
  if (existsSync(config.clientDist)) {
    const root = path.relative(process.cwd(), config.clientDist);
    app.use("*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  return app;
}
