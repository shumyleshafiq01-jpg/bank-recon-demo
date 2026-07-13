import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "usage") {
      const { data, error } = await supabase
        .from("api_usage_logs")
        .select("*")
        .order("timestamp", { ascending: true });
      if (error) throw new Error(error.message);

      const logs = (data ?? []).map((r) => ({
        timestamp: r.timestamp,
        deptId: r.dept_id ?? "",
        deptName: r.dept_name ?? "",
        module: r.module ?? "",
        model: r.model ?? "",
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        costUSD: Number(r.cost_usd) || 0,
      }));

      // Aggregate per dept
      const byDept: Record<string, { deptName: string; calls: number; inputTokens: number; outputTokens: number; costUSD: number }> = {};
      const byModule: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUSD: number }> = {};

      for (const log of logs) {
        const dk = log.deptId || "default";
        if (!byDept[dk]) byDept[dk] = { deptName: log.deptName || "Default", calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
        byDept[dk].calls++;
        byDept[dk].inputTokens  += log.inputTokens;
        byDept[dk].outputTokens += log.outputTokens;
        byDept[dk].costUSD      += log.costUSD;

        const mk = log.module || "Unknown";
        if (!byModule[mk]) byModule[mk] = { calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
        byModule[mk].calls++;
        byModule[mk].inputTokens  += log.inputTokens;
        byModule[mk].outputTokens += log.outputTokens;
        byModule[mk].costUSD      += log.costUSD;
      }

      const totalCost  = logs.reduce((s, l) => s + l.costUSD, 0);
      const totalCalls = logs.length;
      return Response.json({ totalCost, totalCalls, byDept, byModule, recentLogs: logs.slice(-20).reverse() });
    }

    // Return dept keys (with key masked for display)
    const { data, error } = await supabase
      .from("dept_api_keys")
      .select("*")
      .eq("active", true);
    if (error) throw new Error(error.message);

    const depts = (data ?? []).map((r) => ({
      id: r.id,
      deptName: r.dept_name ?? "",
      maskedKey: r.api_key ? `${r.api_key.slice(0, 8)}...${r.api_key.slice(-4)}` : "",
      createdAt: r.created_at ?? "",
    }));
    return Response.json({ depts });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; deptName?: string; apiKey?: string; deptId?: string; usage?: Record<string, unknown> };

    if (body.action === "add-dept") {
      const id = Math.random().toString(36).slice(2, 10);
      const { error } = await supabase.from("dept_api_keys").insert({
        id,
        dept_name: body.deptName ?? "",
        api_key: body.apiKey ?? "",
        created_at: new Date().toISOString(),
        active: true,
      });
      if (error) throw new Error(error.message);
      return Response.json({ created: true, id });
    }

    if (body.action === "delete-dept") {
      const { error } = await supabase
        .from("dept_api_keys")
        .update({ active: false })
        .eq("id", body.deptId);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    if (body.action === "log-usage") {
      const u = body.usage as { deptId: string; deptName: string; module: string; model: string; inputTokens: number; outputTokens: number; costUSD: number };
      const { error } = await supabase.from("api_usage_logs").insert({
        timestamp: new Date().toISOString(),
        dept_id: u.deptId,
        dept_name: u.deptName,
        module: u.module,
        model: u.model,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cost_usd: u.costUSD,
      });
      if (error) throw new Error(error.message);
      return Response.json({ logged: true });
    }

    if (body.action === "get-key") {
      // Return actual API key for a dept (server-side only, used by AI routes)
      const { data, error } = await supabase
        .from("dept_api_keys")
        .select("api_key")
        .eq("id", body.deptId)
        .eq("active", true)
        .single();
      if (error && error.code !== "PGRST116") throw new Error(error.message);
      return Response.json({ apiKey: data ? data.api_key : null });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
