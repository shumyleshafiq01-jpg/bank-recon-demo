import { supabase } from "@/lib/supabase";

// Rice division brands — separate table from Food & Spices (pl_brands) so the
// two divisions never mix.

/* ── snake_case DB row → camelCase frontend object ── */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    country: row.country ?? "",
    logoUrl: row.logo_url ?? "",
    createdAt: row.created_at ?? "",
    contactPerson: row.contact_person ?? "",
    website: row.website ?? "",
    email: row.email ?? "",
  };
}

/* ── camelCase frontend object → snake_case DB row ── */
function toRow(b: Record<string, unknown>, isNew: boolean) {
  const row: Record<string, unknown> = {
    id: String(b.id ?? ""),
    name: String(b.name ?? ""),
    address: String(b.address ?? ""),
    city: String(b.city ?? ""),
    country: String(b.country ?? ""),
    logo_url: String(b.logoUrl ?? ""),
    contact_person: String(b.contactPerson ?? ""),
    website: String(b.website ?? ""),
    email: String(b.email ?? ""),
  };
  if (isNew) {
    row.created_at = new Date().toISOString();
  }
  return row;
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("rice_brands").select("*");
    if (error) throw error;
    return Response.json({ brands: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; brand?: Record<string, unknown> };

    if (body.action === "upsert" && body.brand) {
      const b = body.brand;
      // Check if this is a new brand or an update
      let isNew = true;
      if (b.id) {
        const { data: existing } = await supabase.from("rice_brands").select("id").eq("id", b.id).limit(1);
        isNew = !existing || existing.length === 0;
      }
      const row = toRow(b, isNew);
      const { error } = await supabase.from("rice_brands").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.brand) {
      const { error } = await supabase.from("rice_brands").delete().eq("id", body.brand.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
