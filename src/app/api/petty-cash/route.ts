import { supabase } from "@/lib/supabase";

type LedgerEntry = {
  id: string; date: string; acHead: string; txnNo: string;
  purpose: string; approvedBy: string;
  cashOut: number | null; cashIn: number | null;
  holder?: "main" | "aa1" | "aa2";
};

// snake_case DB row → camelCase frontend
function toFrontend(r: Record<string, unknown>): LedgerEntry {
  return {
    id: (r.id as string) ?? "",
    date: (r.date as string) ?? "",
    acHead: (r.ac_head as string) ?? "",
    txnNo: (r.txn_no as string) ?? "",
    purpose: (r.purpose as string) ?? "",
    approvedBy: (r.approved_by as string) ?? "",
    cashOut: r.cash_out === null || r.cash_out === undefined ? null : Number(r.cash_out) || 0,
    cashIn: r.cash_in === null || r.cash_in === undefined ? null : Number(r.cash_in) || 0,
    holder: ((r.holder as string) || "main") as "main" | "aa1" | "aa2",
  };
}

// camelCase frontend → snake_case DB row
function toDb(e: LedgerEntry) {
  return {
    id: e.id,
    date: e.date ?? "",
    ac_head: e.acHead ?? "",
    txn_no: e.txnNo ?? "",
    purpose: e.purpose ?? "",
    approved_by: e.approvedBy ?? "",
    cash_out: e.cashOut ?? null,
    cash_in: e.cashIn ?? null,
    holder: e.holder ?? "main",
  };
}

export async function GET() {
  try {
    const [ledgerRes, configRes] = await Promise.all([
      supabase.from("pc_ledger").select("*"),
      supabase.from("pc_config").select("*"),
    ]);

    if (ledgerRes.error) throw new Error(ledgerRes.error.message);
    if (configRes.error) throw new Error(configRes.error.message);

    const entries = (ledgerRes.data ?? []).map(toFrontend);

    const config: Record<string, string> = {};
    for (const row of configRes.data ?? []) {
      if (row.key) config[row.key] = row.value ?? "";
    }

    return Response.json({
      entries,
      openingBalance: parseFloat(config.openingBalance || "0") || 0,
      openingDate: config.openingDate || "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

async function saveConfig(openingBalance: unknown, openingDate: unknown) {
  // Upsert both config keys
  const rows = [
    { key: "openingBalance", value: String(openingBalance ?? 0) },
    { key: "openingDate", value: String(openingDate ?? "") },
  ];
  const { error } = await supabase.from("pc_config").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      entry?: LedgerEntry;
      id?: string;
      entries?: LedgerEntry[];
      openingBalance?: number;
      openingDate?: string;
    };

    // ── Per-row upsert ──
    if (body.action === "upsert-entry" && body.entry) {
      const { error } = await supabase
        .from("pc_ledger")
        .upsert(toDb(body.entry), { onConflict: "id" });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    // ── Per-row delete ──
    if (body.action === "delete-entry" && body.id) {
      const { error } = await supabase
        .from("pc_ledger")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    // ── Config (opening balance/date) ──
    if (body.action === "save-config") {
      await saveConfig(body.openingBalance, body.openingDate);
      return Response.json({ saved: true });
    }

    // ── Legacy whole-array path — merge/upsert each entry ──
    if (body.entries) {
      const dbRows = body.entries.filter((e) => e.id).map(toDb);
      if (dbRows.length > 0) {
        const { error } = await supabase
          .from("pc_ledger")
          .upsert(dbRows, { onConflict: "id" });
        if (error) throw new Error(error.message);
      }
      if (body.openingBalance !== undefined) await saveConfig(body.openingBalance, body.openingDate);
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
