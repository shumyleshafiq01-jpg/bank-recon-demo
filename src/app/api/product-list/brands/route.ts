import { supabase } from "@/lib/supabase";

const TABLE = "pl_brands";

// Supabase snake_case → frontend camelCase
function toFrontend(row: Record<string, unknown>) {
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

// Frontend camelCase → Supabase snake_case
function toDb(b: Record<string, unknown>, createdAt?: string) {
  return {
    id: b.id ?? "",
    name: b.name ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    country: b.country ?? "",
    logo_url: b.logoUrl ?? "",
    created_at: createdAt ?? new Date().toISOString(),
    contact_person: b.contactPerson ?? "",
    website: b.website ?? "",
    email: b.email ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;
    return Response.json({ brands: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; brand?: Record<string, unknown> };

    if (body.action === "upsert" && body.brand) {
      const b = body.brand;
      // Check if exists to preserve createdAt
      let createdAt: string | undefined;
      if (b.id) {
        const { data: existing } = await supabase.from(TABLE).select("created_at").eq("id", b.id).single();
        if (existing) createdAt = existing.created_at;
      }
      const { error } = await supabase.from(TABLE).upsert(toDb(b, createdAt), { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.brand) {
      const { error } = await supabase.from(TABLE).delete().eq("id", body.brand.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
