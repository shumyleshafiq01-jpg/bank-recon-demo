import { supabase } from "@/lib/supabase";

const genId = () => Math.random().toString(36).slice(2, 10);

function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    imageUrl: row.image_url ?? "",
    productIds: (row.product_ids as string[] | null) ?? [],
    bagIds: (row.bag_ids as string[] | null) ?? [],
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toRow(m: Record<string, unknown>) {
  return {
    id: String(m.id ?? genId()),
    name: String(m.name ?? ""),
    image_url: String(m.imageUrl ?? ""),
    product_ids: (m.productIds as string[]) ?? [],
    bag_ids: (m.bagIds as string[]) ?? [],
    sort_order: Number(m.sortOrder) || 0,
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("rice_mockups")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return Response.json({ mockups: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; mockup?: Record<string, unknown>; id?: string };

    if (body.action === "upsert" && body.mockup) {
      const row = toRow(body.mockup);
      const { error } = await supabase.from("rice_mockups").upsert(row, { onConflict: "id" });
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("rice_mockups").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
