import path from "node:path";

export type CacheMode = "readwrite" | "offline";

export type ServerConfig = {
  port: number;
  /** Active site: names the cache directory data/cache/<siteId>/. */
  siteId: string;
  /** Address that is loaded by default and cached under the site directory. */
  siteAddress: string;
  cacheMode: CacheMode;
  /** Absolute path of data/cache. */
  cacheRoot: string;
  /** Model for the in-app LLM calls (LLM_MODEL). */
  llmModel: string;
  /** Absolute path of data/sites (site fixtures). */
  sitesRoot: string;
};

/** Repo root, resolved from this file (server/src) so it does not depend on the working directory. */
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const mode = env.CACHE_MODE ?? "readwrite";
  if (mode !== "readwrite" && mode !== "offline") {
    throw new Error(`CACHE_MODE must be "readwrite" or "offline", got "${mode}"`);
  }
  return {
    port: Number(env.SERVER_PORT ?? 8787),
    siteId: env.SITE_ID || "placeholder",
    siteAddress: env.SITE_ADDRESS || "Hendrik Casimirstraat 8, Delft",
    cacheMode: mode,
    llmModel: env.LLM_MODEL || "claude-sonnet-5-5",
    cacheRoot: path.join(REPO_ROOT, "data", "cache"),
    sitesRoot: path.join(REPO_ROOT, "data", "sites"),
  };
}
