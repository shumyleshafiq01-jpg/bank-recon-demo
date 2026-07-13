import { supabase } from "@/lib/supabase";

const TABLE = "pl_categories";

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    createdAt: row.created_at ?? "",
  };
}

function toDb(c: Record<string, unknown>, createdAt?: string) {
  return {
    id: c.id ?? "",
    name: c.name ?? "",
    created_at: createdAt ?? new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;
    return Response.json({ categories: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; category?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.category) {
      const c = body.category;
      let createdAt: string | undefined;
      if (c.id) {
        const { data: existing } = await supabase.from(TABLE).select("created_at").eq("id", c.id).single();
        if (existing) createdAt = existing.created_at;
      }
      const { error } = await supabase.from(TABLE).upsert(toDb(c, createdAt), { onConflict: "id" });
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
