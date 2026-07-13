import { supabase } from "@/lib/supabase";
import { RICE_DEFAULT_CHARGES } from "@/lib/rice-costing";

// Rice "Master Prices": the shared milling & handling charges (PKR/kg).
// (By-product resale rates are per-product; bag packaging lives in rice_bags.
//  Any legacy "byproduct"/"bag" rows in this table are ignored.)

const genId = () => Math.random().toString(36).slice(2, 10);

/* ── snake_case DB row → camelCase frontend object ── */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    kind: (row.kind ?? "charge") as "byproduct" | "charge" | "bag",
    name: row.name ?? "",
    rate: Number(row.rate) || 0,
    sortOrder: Number(row.sort_order) || 0,
  };
}

/* ── camelCase frontend object → snake_case DB row ── */
function toRow(it: Record<string, unknown>) {
  return {
    id: String(it.id ?? genId()),
    kind: String(it.kind ?? "charge"),
    name: String(it.name ?? ""),
    rate: Number(it.rate) || 0,
    sort_order: Number(it.sortOrder) || 0,
  };
}

async function ensureSeeded() {
  const { data, error } = await supabase
    .from("rice_master")
    .select("id, kind")
    .eq("kind", "charge")
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;

  const seed = RICE_DEFAULT_CHARGES.map((c, i) => ({
    id: genId(),
    kind: "charge",
    name: c.name,
    rate: c.rate,
    sort_order: i,
  }));
  if (seed.length) {
    const { error: insertErr } = await supabase.from("rice_master").insert(seed);
    if (insertErr) throw insertErr;
  }
}

export async function GET() {
  try {
    await ensureSeeded();
    const { data, error } = await supabase
      .from("rice_master")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const items = (data ?? []).map(toClient);
    return Response.json({
      byproducts: items.filter(i => i.kind === "byproduct"),
      charges: items.filter(i => i.kind === "charge"),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; item?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.item) {
      const row = toRow(body.item);
      const { error } = await supabase.from("rice_master").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("rice_master").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
