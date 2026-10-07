// One Claude call in its own process. Reads a request as JSON on stdin, writes one JSON line on
// stdout. Spawned by agentSdkClient.ts: importing the Agent SDK inside the server process hangs
// under `concurrently` + `tsx watch` (npm run dev), while a plain child process is unaffected.
// Plain JavaScript so it runs with `node` directly, without tsx.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const req = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const env = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "massing-studio/0.0.0" };
// An empty key in .env would shadow the Claude login.
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) if (!env[k]) delete env[k];

let result;
let assistantError;
for await (const m of query({
  prompt: req.user,
  options: {
    model: req.model,
    systemPrompt: req.system,
    // Isolated on purpose: no tools, no MCP servers (not the user's claude.ai connectors either),
    // no settings or CLAUDE.md, no session files, an empty working directory.
    tools: [],
    mcpServers: {},
    strictMcpConfig: true,
    settings: { disableClaudeAiConnectors: true },
    settingSources: [],
    persistSession: false,
    maxTurns: req.maxTurns,
    effort: req.effort,
    cwd: mkdtempSync(path.join(os.tmpdir(), "massing-llm-")),
    env,
    outputFormat: { type: "json_schema", schema: req.jsonSchema },
  },
})) {
  if (m.type === "assistant" && m.error) assistantError = m.error;
  if (m.type === "result") result = m;
}

const out = result && {
  subtype: result.subtype,
  stopReason: result.stop_reason,
  errors: result.subtype === "success" ? [] : result.errors,
  structuredOutput: result.subtype === "success" ? result.structured_output : undefined,
  costUsd: result.total_cost_usd,
  models: Object.keys(result.modelUsage),
};
process.stdout.write(JSON.stringify({ result: out ?? null, assistantError: assistantError ?? null }) + "\n");
