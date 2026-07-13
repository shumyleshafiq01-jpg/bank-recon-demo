import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("dashboard_config")
      .select("*")
      .eq("key", "hidden_modules")
      .single();

    if (error && error.code !== "PGRST116") throw new Error(error.message);

    const hidden = data?.value ? (typeof data.value === "string" ? JSON.parse(data.value) : data.value) : [];
    return Response.json({ hiddenModules: hidden });
  } catch {
    return Response.json({ hiddenModules: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { hiddenModules: string[] };
    const { error } = await supabase
      .from("dashboard_config")
      .upsert({ key: "hidden_modules", value: JSON.stringify(body.hiddenModules) }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return Response.json({ saved: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
