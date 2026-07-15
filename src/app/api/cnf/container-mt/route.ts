import { supabase } from "@/lib/supabase";

type MtRow = {
  id: string;
  country: string;
  mt20: number;
  mt40: number;
  mt40hc: number;
  updatedAt: string;
};

function toClient(row: Record<string, unknown>): MtRow {
  return {
    id: String(row.id ?? ""),
    country: String(row.country ?? ""),
    mt20: Number(row.mt_20 ?? 0),
    mt40: Number(row.mt_40 ?? 0),
    mt40hc: Number(row.mt_40hc ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("cnf_container_mt").select("*").order("country");
    if (error) throw error;
    return Response.json({ rows: (data ?? []).map(toClient) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err) ? String((err as Record<string,unknown>).message) : JSON.stringify(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { rows } = await request.json() as { rows: Record<string, unknown>[] };
    const now = new Date().toISOString();

    const upsertRows = rows
      .filter((r) => r.id && r.country)
      .map((r) => ({
        id: String(r.id),
        country: String(r.country ?? ""),
        mt_20: Number(r.mt20 ?? 0),
        mt_40: Number(r.mt40 ?? 0),
        mt_40hc: Number(r.mt40hc ?? 0),
        updated_at: now,
      }));

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from("cnf_container_mt")
        .upsert(upsertRows, { onConflict: "id" });
      if (error) throw error;
    }

    return Response.json({ saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err) ? String((err as Record<string,unknown>).message) : JSON.stringify(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
