import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    date: (r.date as string) ?? "",
    holder: ((r.holder as string) ?? "aa2") as "aa1" | "aa2",
    denominations: (r.denominations_json as Record<string, number>) ?? {},
    total: Number(r.total) || 0,
    countedBy: (r.counted_by as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("pc_denominations").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ counts: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action: "create" | "delete";
      count?: { date: string; holder: "aa1" | "aa2"; denominations: Record<string, number>; total: number; countedBy: string };
      id?: string;
    };

    if (body.action === "create" && body.count) {
      const c = body.count;
      const { error } = await supabase.from("pc_denominations").insert({
        id: crypto.randomUUID(),
        date: c.date,
        holder: c.holder,
        denominations_json: c.denominations,
        total: c.total,
        counted_by: c.countedBy,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("pc_denominations")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
