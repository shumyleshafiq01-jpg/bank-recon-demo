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

    // Never expose stored secrets — mask to last 4 characters
    const SECRET_KEYS = ["whatsapp_token", "whatsapp_api_key", "resend_api_key"];
    for (const k of SECRET_KEYS) {
      if (settings[k]) settings[k] = "••••" + settings[k].slice(-4);
    }

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
      // A masked value means "unchanged secret" — don't overwrite the real key
      if (typeof body.value === "string" && body.value.startsWith("••••")) {
        return Response.json({ ok: true, skipped: true });
      }
      const { error } = await supabase
        .from("sc_settings")
        .upsert({ key: body.key, value: String(body.value), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Update a container type's rated weight capacity (PMT) — e.g. rice
    // is weight-limited: 20ft=25 PMT, 40ft/40HC=27 PMT by default, editable.
    if (body.action === "update-container-weight" && body.name) {
      const { error } = await supabase
        .from("sc_container_types")
        .update({ max_weight_pmt: Number(body.maxWeightPmt || 0) })
        .eq("name", body.name);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
