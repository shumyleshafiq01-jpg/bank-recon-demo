import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Sonnet 4.6 pricing: $3/M input, $15/M output
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

export interface UsageEntry {
  timestamp: string;
  module: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

const LOG_PATH = join(process.cwd(), ".usage-log.json");

function readLog(): UsageEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  try { return JSON.parse(readFileSync(LOG_PATH, "utf-8")); } catch { return []; }
}

function appendLog(entry: UsageEntry) {
  // Vercel's filesystem is read-only (only /tmp is writable), so file logging
  // will throw EROFS in production. Never let that break the AI response.
  try {
    const log = readLog();
    log.push(entry);
    writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
  } catch {
    /* read-only filesystem (e.g. Vercel) — skip persistent logging */
  }
}

export function logUsage(module: string, model: string, inputTokens: number, outputTokens: number) {
  try {
    const cost = calcCost(model, inputTokens, outputTokens);
    appendLog({
      timestamp: new Date().toISOString(),
      module,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(cost * 10000) / 10000,
    });
  } catch {
    /* never throw from usage logging */
  }
}

export { readLog };
