import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    date: (r.date as string) ?? "",
    holder: ((r.holder as string) ?? "aa2") as "aa1" | "aa2",
    amount: Number(r.amount) || 0,
    notes: (r.notes as string) ?? "",
    givenBy: (r.given_by as string) ?? "",
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("pc_handovers").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ handovers: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action: "create" | "delete";
      handover?: { date: string; holder: "aa1" | "aa2"; amount: number; notes: string; givenBy: string };
      id?: string;
    };

    if (body.action === "create" && body.handover) {
      const h = body.handover;
      const { error } = await supabase.from("pc_handovers").insert({
        id: crypto.randomUUID(),
        date: h.date,
        holder: h.holder,
        amount: h.amount,
        notes: h.notes,
        given_by: h.givenBy,
        created_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("pc_handovers")
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
