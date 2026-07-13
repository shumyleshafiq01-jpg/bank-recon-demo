import { supabase } from "@/lib/supabase";
import { RICE_DEFAULT_BAGS } from "@/lib/rice-costing";

// Rice bag packaging — the component prices per bag type & size. The $/PMT
// surcharge (added at CNF) is CALCULATED from these via calcBagRate, so updating
// a bag's PKR prices or the dollar rate re-prices every quote automatically.

const genId = () => Math.random().toString(36).slice(2, 10);

/* ── snake_case DB row → camelCase frontend object ── */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    type: row.type ?? "",
    sizeLabel: row.size_label ?? "",
    outerQty: Number(row.outer_qty) || 0,
    outerPKR: Number(row.outer_pkr) || 0,
    innerQty: Number(row.inner_qty) || 0,
    innerPKR: Number(row.inner_pkr) || 0,
    masterQty: Number(row.master_qty) || 0,
    masterPKR: Number(row.master_pkr) || 0,
    labourPKR: Number(row.labour_pkr) || 0,
    sortOrder: Number(row.sort_order) || 0,
  };
}

/* ── camelCase frontend object → snake_case DB row ── */
function toRow(b: Record<string, unknown>) {
  return {
    id: String(b.id ?? genId()),
    type: String(b.type ?? ""),
    size_label: String(b.sizeLabel ?? ""),
    outer_qty: Number(b.outerQty) || 0,
    outer_pkr: Number(b.outerPKR) || 0,
    inner_qty: Number(b.innerQty) || 0,
    inner_pkr: Number(b.innerPKR) || 0,
    master_qty: Number(b.masterQty) || 0,
    master_pkr: Number(b.masterPKR) || 0,
    labour_pkr: Number(b.labourPKR) || 0,
    sort_order: Number(b.sortOrder) || 0,
  };
}

// First open: seed the NON WOVEN component prices from Hafeez's sheet so the
// accountant has real, recognisable data to review/adjust.
async function ensureSeeded() {
  const { data, error } = await supabase.from("rice_bags").select("id").limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;

  const seed = RICE_DEFAULT_BAGS.map((b, i) => toRow({ ...b, id: genId(), sortOrder: i }));
  if (seed.length) {
    const { error: insertErr } = await supabase.from("rice_bags").insert(seed);
    if (insertErr) throw insertErr;
  }
}

export async function GET() {
  try {
    await ensureSeeded();
    const { data, error } = await supabase
      .from("rice_bags")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const bags = (data ?? []).map(toClient);
    return Response.json({ bags });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; bag?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.bag) {
      const row = toRow(body.bag);
      const { error } = await supabase.from("rice_bags").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("rice_bags").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
