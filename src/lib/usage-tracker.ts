import { supabase } from "@/lib/supabase";

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

async function readLogFromSupabase(): Promise<UsageEntry[]> {
  const { data, error } = await supabase
    .from("api_usage_logs")
    .select("timestamp, module, model, input_tokens, output_tokens, cost_usd")
    .order("timestamp", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => ({
    timestamp: r.timestamp,
    module: r.module,
    model: r.model,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_usd: r.cost_usd,
  }));
}

async function logToSupabase(
  module: string, model: string, inputTokens: number, outputTokens: number,
  costUSD: number, deptId = "", deptName = "Default"
) {
  try {
    await supabase.from("api_usage_logs").insert({
      timestamp: new Date().toISOString(),
      dept_id: deptId,
      dept_name: deptName,
      module,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUSD,
    });
  } catch {
    /* never throw from usage logging */
  }
}

export function logUsage(
  module: string, model: string, inputTokens: number, outputTokens: number,
  deptId = "", deptName = "Default"
) {
  try {
    const cost = calcCost(model, inputTokens, outputTokens);
    const rounded = Math.round(cost * 10000) / 10000;
    // Log to Supabase (async, non-blocking)
    logToSupabase(module, model, inputTokens, outputTokens, rounded, deptId, deptName).catch(() => {});
  } catch {
    /* never throw from usage logging */
  }
}

export { readLogFromSupabase as readLog };
