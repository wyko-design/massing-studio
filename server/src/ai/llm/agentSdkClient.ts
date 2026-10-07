import { spawn } from "node:child_process";
import path from "node:path";
import type { SDKAssistantMessageError, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { LlmError, type LlmClient, type LlmRequest, type LlmResult } from "./types";

/** Structured output runs as a tool round trip, so one call takes a couple of turns. */
const MAX_TURNS = 4;
/** A call normally takes 5–15 s; past this something is stuck. */
const TIMEOUT_MS = 180_000;
const WORKER = path.join(import.meta.dirname, "agentSdkWorker.mjs");

const UNAVAILABLE: SDKAssistantMessageError[] = [
  "authentication_failed",
  "oauth_org_not_allowed",
  "account_on_hold",
  "verification_required",
  "billing_error",
  "rate_limit",
  "overloaded",
  "server_error",
  "model_not_found",
  "cloud_credential_error",
];

/** What agentSdkWorker.mjs writes back: the parts of the SDK result message we use. */
type WorkerReply = {
  result: {
    subtype: SDKResultMessage["subtype"];
    stopReason: string | null;
    errors: string[];
    structuredOutput?: unknown;
    costUsd: number;
    models: string[];
  } | null;
  assistantError: SDKAssistantMessageError | null;
};

/** Run the worker once: request JSON on stdin, one JSON line back on stdout. */
function runWorker(input: object): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new LlmError("unavailable", `Claude did not answer within ${TIMEOUT_MS / 1000} s.`));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new LlmError("unavailable", `Could not start the Claude worker: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as WorkerReply);
      } catch {
        const tail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400);
        reject(new LlmError("unavailable", `Claude could not be reached (worker exit ${code}): ${tail || "no output"}`));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

/**
 * Calls Claude through the Claude Agent SDK, which runs the bundled Claude Code binary with the
 * local Claude login (or ANTHROPIC_API_KEY when one is set). Each call runs in its own worker
 * process (agentSdkWorker.mjs), fully isolated: no tools, MCP, settings or CLAUDE.md.
 */
export class AgentSdkClient implements LlmClient {
  constructor(readonly model: string) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    const { result, assistantError } = await runWorker({
      model: this.model,
      system: req.system,
      user: req.user,
      jsonSchema: req.jsonSchema,
      effort: req.effort,
      maxTurns: MAX_TURNS,
    });

    if (assistantError && UNAVAILABLE.includes(assistantError)) {
      throw new LlmError("unavailable", `Claude is unavailable (${assistantError.replaceAll("_", " ")}).`);
    }
    if (assistantError === "max_output_tokens") throw new LlmError("truncated", "The answer was cut off (max output tokens).");
    if (!result) throw new LlmError("failed", "Claude returned no result.");
    if (result.stopReason === "refusal") throw new LlmError("refusal", "Claude declined this request.");
    if (result.subtype !== "success") {
      const detail = result.errors.join("; ") || result.subtype.replaceAll("_", " ");
      throw new LlmError("failed", `Claude call failed: ${detail}`);
    }
    if (result.structuredOutput === undefined) throw new LlmError("failed", "Claude returned no structured output.");
    // modelUsage also lists the SDK's internal helper calls (e.g. a small model), so prefer the requested one.
    const model = result.models.find((m) => m.startsWith(this.model)) ?? result.models[0] ?? this.model;
    return { output: result.structuredOutput, model, costUsd: result.costUsd };
  }
}
