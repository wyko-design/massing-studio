import path from "node:path";

export type CacheMode = "readwrite" | "offline";

export type ServerConfig = {
  port: number;
  /** Interface to bind. 127.0.0.1 for local dev; 0.0.0.0 when hosted (HOST). */
  host: string;
  /** If set, the whole site asks for this shared password (ACCESS_PASSWORD, HTTP Basic auth). */
  accessPassword?: string;
  /** Max AI calls per hour across all users (AI_HOURLY_LIMIT), a cap on API spend when hosted. */
  aiHourlyLimit: number;
  /** Built client served by the server in production; ignored when the folder does not exist. */
  clientDist: string;
  /** Active site: names the cache directory data/cache/<siteId>/. */
  siteId: string;
  /** Address that is loaded by default and cached under the site directory. */
  siteAddress: string;
  cacheMode: CacheMode;
  /** Absolute path of data/cache. */
  cacheRoot: string;
  /** Model for the in-app LLM calls (LLM_MODEL). */
  llmModel: string;
  /** Which model provider the AI routes use (LLM_PROVIDER). */
  llmProvider: "claude" | "gemini";
  /** Google AI Studio key, read only when llmProvider is gemini (GEMINI_API_KEY). */
  geminiApiKey?: string;
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
  const provider = env.LLM_PROVIDER === "gemini" ? "gemini" : "claude";
  return {
    // Hosting platforms hand the port over as PORT.
    port: Number(env.PORT || env.SERVER_PORT || 8787),
    host: env.HOST || "127.0.0.1",
    accessPassword: env.ACCESS_PASSWORD || undefined,
    aiHourlyLimit: Number(env.AI_HOURLY_LIMIT ?? 60),
    clientDist: path.join(REPO_ROOT, "client", "dist"),
    siteId: env.SITE_ID || "placeholder",
    siteAddress: env.SITE_ADDRESS || "Hendrik Casimirstraat 8, Delft",
    cacheMode: mode,
    llmProvider: provider,
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    llmModel: env.LLM_MODEL || (provider === "gemini" ? "gemini-3.8-flash" : "claude-sonnet-5-5"),
    cacheRoot: path.join(REPO_ROOT, "data", "cache"),
    sitesRoot: path.join(REPO_ROOT, "data", "sites"),
  };
}
