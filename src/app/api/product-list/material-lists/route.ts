import { supabase } from "@/lib/supabase";

const TABLE = "pl_material_lists";

const DEFAULT_UNITS = ["PCS", "KG", "GRAM", "LITRE", "METER", "CARTON", "BOTTLE", "POUCH", "CONTAINER"];
const DEFAULT_CATEGORIES = ["Raw Material", "Packaging", "Labels & Seals", "Labor", "Export Charges", "Other"];

async function seedIfEmpty() {
  const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) === 0) {
    const now = new Date().toISOString();
    const seedRows = [
      ...DEFAULT_UNITS.map(name => ({ id: crypto.randomUUID(), type: "unit", name, created_at: now })),
      ...DEFAULT_CATEGORIES.map(name => ({ id: crypto.randomUUID(), type: "category", name, created_at: now })),
    ];
    const { error: insError } = await supabase.from(TABLE).insert(seedRows);
    if (insError) throw insError;
  }
}

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    type: (row.type ?? "unit") as "unit" | "category",
    name: row.name ?? "",
    createdAt: row.created_at ?? "",
  };
}

export async function GET() {
  try {
    await seedIfEmpty();
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;
    const items = (data ?? []).map(toFrontend);
    return Response.json({
      units: items.filter(i => i.type === "unit"),
      categories: items.filter(i => i.type === "category"),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await seedIfEmpty();
    const body = await request.json() as { action: string; item?: { id: string; type: "unit" | "category"; name: string }; id?: string };

    if (body.action === "upsert" && body.item) {
      const it = body.item;
      // Preserve createdAt on update
      let createdAt: string | undefined;
      if (it.id) {
        const { data: existing } = await supabase.from(TABLE).select("created_at").eq("id", it.id).single();
        if (existing) createdAt = existing.created_at;
      }
      const { error } = await supabase.from(TABLE).upsert({
        id: it.id,
        type: it.type,
        name: it.name,
        created_at: createdAt ?? new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from(TABLE).delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
