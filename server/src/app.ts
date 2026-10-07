import { Hono } from "hono";
import { sampleScene } from "@massing/shared";
import { CacheMissError, UpstreamError, createJsonFetcher } from "./cache/diskCache";
import type { ServerConfig } from "./config";
import { Bag3dContextProvider } from "./providers/nl/bag3d";
import { KadasterParcelProvider } from "./providers/nl/kadasterParcel";
import { LocatieserverGeocoder } from "./providers/nl/locatieserver";
import { FixtureZoningProvider } from "./providers/fixtureZoning";
import { SceneError, buildScene, type SceneProviders } from "./scene";
import { AgentSdkClient } from "./ai/llm/agentSdkClient";
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

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function createApp({ config, providersFor, llm }: AppDeps) {
  const app = new Hono();

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

  app.route("/api/ai", aiRoutes(config, llm ?? new AgentSdkClient(config.llmModel)));

  return app;
}
