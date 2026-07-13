import { supabase } from "@/lib/supabase";

// camelCase field → snake_case column mapping for the ledger table
const LEDGER_FIELD_MAP: Record<string, string> = {
  accountId: "account_id",
  id: "id",
  date: "date",
  pdcDate: "pdc_date",
  ibftNo: "ibft_no",
  chequeNo: "cheque_no",
  description: "description",
  debit: "debit",
  credit: "credit",
  aa1Tick: "aa1_tick",
  aa1At: "aa1_at",
  aa2Tick: "aa2_tick",
  aa2At: "aa2_at",
};

/** Map a Supabase bank row to the camelCase shape the frontend expects. */
function bankToClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    bankName: row.bank_name ?? "",
    branch: row.branch ?? "",
    acTitle: row.ac_title ?? "",
    accountNo: row.account_no ?? "",
    iban: row.iban ?? "",
    accountType: row.account_type ?? "",
    branchCode: row.branch_code ?? "",
    notes: row.notes ?? "",
    internetBanking: row.internet_banking ?? "",
    stamp: row.stamp ?? "",
    signatureAuthority: row.signature_authority ?? "",
    mandateHolder: row.mandate_holder ?? "",
    maintainBalance: row.maintain_balance ?? "",
    openingBalance: parseFloat(String(row.opening_balance)) || 0,
    openingDate: row.opening_date ?? "",
  };
}

/** Map a Supabase ledger row to the camelCase shape the frontend expects. */
function entryToClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    date: row.date ?? "",
    pdcDate: row.pdc_date ?? "",
    ibftNo: row.ibft_no ?? "",
    chequeNo: row.cheque_no ?? "",
    description: row.description ?? "",
    debit: row.debit == null ? null : Number(row.debit) || 0,
    credit: row.credit == null ? null : Number(row.credit) || 0,
    aa1Tick: row.aa1_tick ?? false,
    aa1At: row.aa1_at ?? "",
    aa2Tick: row.aa2_tick ?? false,
    aa2At: row.aa2_at ?? "",
  };
}

/** Convert a camelCase bank object from the frontend to snake_case for Supabase. */
function bankToDb(b: Record<string, unknown>) {
  return {
    id: b.id ?? "",
    bank_name: b.bankName ?? "",
    branch: b.branch ?? "",
    ac_title: b.acTitle ?? "",
    account_no: b.accountNo ?? "",
    iban: b.iban ?? "",
    account_type: b.accountType ?? "",
    branch_code: b.branchCode ?? "",
    notes: b.notes ?? "",
    internet_banking: b.internetBanking ?? "",
    stamp: b.stamp ?? "",
    signature_authority: b.signatureAuthority ?? "",
    mandate_holder: b.mandateHolder ?? "",
    maintain_balance: b.maintainBalance ?? "",
    opening_balance: parseFloat(String(b.openingBalance)) || 0,
    opening_date: b.openingDate ?? "",
  };
}

/** Convert a camelCase ledger entry from the frontend to snake_case for Supabase. */
function entryToDb(accountId: string, e: Record<string, unknown>) {
  return {
    account_id: accountId,
    id: e.id ?? "",
    date: e.date ?? "",
    pdc_date: e.pdcDate ?? "",
    ibft_no: e.ibftNo ?? "",
    cheque_no: e.chequeNo ?? "",
    description: e.description ?? "",
    debit: e.debit === "" || e.debit == null ? null : parseFloat(String(e.debit)) || 0,
    credit: e.credit === "" || e.credit == null ? null : parseFloat(String(e.credit)) || 0,
    aa1_tick: e.aa1Tick === true || e.aa1Tick === "true",
    aa1_at: e.aa1At ?? "",
    aa2_tick: e.aa2Tick === true || e.aa2Tick === "true",
    aa2_at: e.aa2At ?? "",
  };
}

export async function GET() {
  try {
    const [bankRes, ledgerRes] = await Promise.all([
      supabase.from("fe_banks").select("*"),
      supabase.from("fe_ledger").select("*"),
    ]);
    if (bankRes.error) throw bankRes.error;
    if (ledgerRes.error) throw ledgerRes.error;

    const banks = (bankRes.data ?? []).map(bankToClient);

    const ledger: Record<string, Record<string, unknown>[]> = {};
    for (const row of ledgerRes.data ?? []) {
      const accountId = String(row.account_id ?? "");
      if (!accountId) continue;
      if (!ledger[accountId]) ledger[accountId] = [];
      ledger[accountId].push(entryToClient(row));
    }

    return Response.json({ banks, ledger });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      bank?: Record<string, unknown>;
      id?: string;
      accountId?: string;
      entry?: Record<string, unknown>;
      rowId?: string;
      banks?: Record<string, string | number>[];
      ledger?: Record<string, Record<string, unknown>[]>;
    };

    // ── Per-row bank upsert ──
    if (body.action === "upsert-bank" && body.bank) {
      const row = bankToDb(body.bank);
      const { error } = await supabase
        .from("fe_banks")
        .upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    // ── Per-row bank delete (also cascade-delete its ledger entries) ──
    if (body.action === "delete-bank" && body.id) {
      const { error: ledgerErr } = await supabase
        .from("fe_ledger")
        .delete()
        .eq("account_id", body.id);
      if (ledgerErr) throw ledgerErr;
      const { error } = await supabase
        .from("fe_banks")
        .delete()
        .eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    // ── Per-row ledger entry upsert ──
    if (body.action === "upsert-entry" && body.accountId && body.entry) {
      const row = entryToDb(body.accountId, body.entry);
      const { error } = await supabase
        .from("fe_ledger")
        .upsert(row, { onConflict: "account_id,id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    // ── Per-row ledger entry delete ──
    if (body.action === "delete-entry" && body.accountId && body.rowId) {
      const { error } = await supabase
        .from("fe_ledger")
        .delete()
        .eq("account_id", body.accountId)
        .eq("id", body.rowId);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    // ── Legacy whole-state merge (older cached tabs) ──
    if (body.banks || body.ledger) {
      if (body.banks) {
        const rows = body.banks.filter((b) => b.id).map((b) => bankToDb(b));
        if (rows.length > 0) {
          const { error } = await supabase
            .from("fe_banks")
            .upsert(rows, { onConflict: "id" });
          if (error) throw error;
        }
      }
      if (body.ledger) {
        for (const [accountId, entries] of Object.entries(body.ledger)) {
          const rows = entries.filter((e) => e.id).map((e) => entryToDb(accountId, e));
          if (rows.length > 0) {
            const { error } = await supabase
              .from("fe_ledger")
              .upsert(rows, { onConflict: "account_id,id" });
            if (error) throw error;
          }
        }
      }
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as {
      accountId: string;
      rowId: string;
      field: string;
      value: string | number | boolean | null;
    };

    // Convert camelCase field name to snake_case column name
    const snakeField = LEDGER_FIELD_MAP[body.field];
    if (!snakeField) {
      return Response.json({ error: `Unknown field: ${body.field}` }, { status: 400 });
    }

    const { error, count } = await supabase
      .from("fe_ledger")
      .update({ [snakeField]: body.value }, { count: "exact" })
      .eq("account_id", body.accountId)
      .eq("id", body.rowId);

    if (error) throw error;
    if (count === 0) {
      return Response.json({ error: "Row not found" }, { status: 404 });
    }

    return Response.json({ updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
