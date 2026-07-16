import { supabase } from "@/lib/supabase";

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    destination: row.destination ?? "",
    country: row.country ?? "",
    freightUsd: row.freight_usd ?? row.freight_per_carton ?? 0,
    currency: row.currency ?? "USD",
    updatedAt: row.updated_at ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("cnf_master_freight").select("*");
    if (error) throw error;
    return Response.json({ freightCards: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { freightCards } = await request.json() as { freightCards: Record<string, unknown>[] };
    const now = new Date().toISOString();

    const upsertRows = freightCards
      .filter((c) => c.id)
      .map((c) => ({
        id: String(c.id),
        destination: String(c.destination ?? ""),
        country: String(c.country ?? ""),
        freight_usd: Number(c.freightUsd ?? 0),
        freight_per_carton: Number(c.freightUsd ?? 0),
        freight_per_ton: Number(c.freightUsd ?? 0),
        currency: String(c.currency ?? "USD"),
        updated_at: now,
      }));

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("cnf_master_freight")
        .upsert(upsertRows, { onConflict: "id" });
      if (error) throw error;
    }

    const providedIds = new Set(upsertRows.map((r) => r.id));
    const { data: existing, error: fetchErr } = await supabase
      .from("cnf_master_freight")
      .select("id");
    if (fetchErr) throw fetchErr;

    const toDelete = (existing ?? []).map((r) => r.id).filter((id: string) => !providedIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("cnf_master_freight")
        .delete()
        .in("id", toDelete);
      if (delErr) throw delErr;
    }

    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
