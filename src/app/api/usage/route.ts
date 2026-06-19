import { readLog, logUsage } from "@/lib/usage-tracker";

export async function GET() {
  const entries = readLog();
  const totalCost = entries.reduce((s, e) => s + e.cost_usd, 0);
  const totalInput = entries.reduce((s, e) => s + e.input_tokens, 0);
  const totalOutput = entries.reduce((s, e) => s + e.output_tokens, 0);

  const byModule: Record<string, { calls: number; cost: number }> = {};
  for (const e of entries) {
    const m = byModule[e.module] ?? { calls: 0, cost: 0 };
    m.calls++;
    m.cost += e.cost_usd;
    byModule[e.module] = m;
  }

  return Response.json({
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCalls: entries.length,
    byModule,
    entries: entries.slice(-50),
  });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    module: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
  };

  logUsage(body.module, body.model, body.input_tokens, body.output_tokens);
  return Response.json({ logged: true });
}
