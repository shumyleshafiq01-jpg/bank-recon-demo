import { ensureSheet, readSheet, writeRows, clearAndWrite } from "@/lib/google-sheets";

const KEYS_SHEET  = "DeptAPIKeys";
const USAGE_SHEET = "APIUsageLogs";

const KEYS_HEADERS  = ["id", "deptName", "apiKey", "createdAt", "active"];
const USAGE_HEADERS = ["timestamp", "deptId", "deptName", "module", "model", "inputTokens", "outputTokens", "costUSD"];

async function init() {
  await ensureSheet(KEYS_SHEET, KEYS_HEADERS);
  await ensureSheet(USAGE_SHEET, USAGE_HEADERS);
}

// ── Dept Keys ─────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    await init();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "usage") {
      const rows = await readSheet(USAGE_SHEET);
      const logs = rows.slice(1).filter(r => r[0]).map(r => ({
        timestamp: r[0], deptId: r[1], deptName: r[2], module: r[3],
        model: r[4], inputTokens: Number(r[5]) || 0, outputTokens: Number(r[6]) || 0,
        costUSD: parseFloat(r[7]) || 0,
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
    const rows = await readSheet(KEYS_SHEET);
    const depts = rows.slice(1).filter(r => r[0] && r[4] === "true").map(r => ({
      id: r[0], deptName: r[1],
      maskedKey: r[2] ? `${r[2].slice(0, 8)}...${r[2].slice(-4)}` : "",
      createdAt: r[3],
    }));
    return Response.json({ depts });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; deptName?: string; apiKey?: string; deptId?: string; usage?: Record<string, unknown> };

    if (body.action === "add-dept") {
      const id = Math.random().toString(36).slice(2, 10);
      await writeRows(KEYS_SHEET, [[id, body.deptName ?? "", body.apiKey ?? "", new Date().toISOString(), "true"]]);
      return Response.json({ created: true, id });
    }

    if (body.action === "delete-dept") {
      const rows = await readSheet(KEYS_SHEET);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.deptId) { rows[i][4] = "false"; break; }
      }
      await clearAndWrite(KEYS_SHEET, rows);
      return Response.json({ deleted: true });
    }

    if (body.action === "log-usage") {
      const u = body.usage as { deptId: string; deptName: string; module: string; model: string; inputTokens: number; outputTokens: number; costUSD: number };
      await writeRows(USAGE_SHEET, [[new Date().toISOString(), u.deptId, u.deptName, u.module, u.model, String(u.inputTokens), String(u.outputTokens), String(u.costUSD)]]);
      return Response.json({ logged: true });
    }

    if (body.action === "get-key") {
      // Return actual API key for a dept (server-side only, used by AI routes)
      const rows = await readSheet(KEYS_SHEET);
      const row = rows.slice(1).find(r => r[0] === body.deptId && r[4] === "true");
      return Response.json({ apiKey: row ? row[2] : null });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
