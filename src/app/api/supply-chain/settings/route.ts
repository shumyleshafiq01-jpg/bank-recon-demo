import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase.from("sc_settings").select("key, value");
    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const row of data ?? []) settings[row.key] = row.value;

    const { data: containers, error: cErr } = await supabase
      .from("sc_container_types")
      .select("*")
      .order("name");
    if (cErr) throw cErr;

    return Response.json({ settings, containers: containers ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "update-setting" && body.key) {
      const { error } = await supabase
        .from("sc_settings")
        .upsert({ key: body.key, value: String(body.value), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
