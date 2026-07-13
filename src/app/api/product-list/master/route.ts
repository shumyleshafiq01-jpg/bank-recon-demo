import { supabase } from "@/lib/supabase";

const TABLE = "pl_master";

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    unit: row.unit ?? "",
    category: row.category ?? "",
    pricePerUnit: parseFloat(String(row.price_per_unit)) || 0,
    updatedAt: row.updated_at ?? "",
    defaultUnitType: (row.default_unit_type || "PCS") as "PCS" | "CONTAINER" | "FIXED",
  };
}

function toDb(m: Record<string, unknown>) {
  return {
    id: m.id ?? "",
    name: m.name ?? "",
    unit: m.unit ?? "",
    category: m.category ?? "",
    price_per_unit: m.pricePerUnit ?? 0,
    updated_at: new Date().toISOString(),
    default_unit_type: m.defaultUnitType ?? "PCS",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;
    return Response.json({ materials: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; material?: Record<string, unknown>; materials?: Record<string, unknown>[] };

    if (body.action === "upsert" && body.material) {
      const { error } = await supabase.from(TABLE).upsert(toDb(body.material), { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.material) {
      const { error } = await supabase.from(TABLE).delete().eq("id", body.material.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    if (body.action === "bulk" && body.materials) {
      // Delete all then insert — mirrors the old clearAndWrite behavior
      const { error: delError } = await supabase.from(TABLE).delete().neq("id", "");
      if (delError) throw delError;
      const rows = body.materials.map(m => toDb(m));
      if (rows.length > 0) {
        const { error: insError } = await supabase.from(TABLE).insert(rows);
        if (insError) throw insError;
      }
      return Response.json({ saved: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
