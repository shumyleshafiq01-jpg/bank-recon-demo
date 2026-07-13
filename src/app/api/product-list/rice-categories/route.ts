import { supabase } from "@/lib/supabase";

// Rice division categories — separate table from Food & Spices (pl_categories).

/* ── snake_case DB row → camelCase frontend object ── */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    createdAt: row.created_at ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("rice_categories").select("*");
    if (error) throw error;
    return Response.json({ categories: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; category?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.category) {
      const c = body.category;
      const row: Record<string, unknown> = {
        id: String(c.id ?? ""),
        name: String(c.name ?? ""),
      };
      // Only set created_at for new inserts (when no id exists yet in the table)
      // Supabase upsert will keep existing created_at on update if we don't send it
      if (!c.id) {
        row.created_at = new Date().toISOString();
      }
      const { error } = await supabase.from("rice_categories").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("rice_categories").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
