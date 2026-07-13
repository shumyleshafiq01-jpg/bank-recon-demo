import { supabase } from "@/lib/supabase";
import { RICE_DEFAULT_SETTINGS } from "@/lib/rice-costing";

const KEYS = ["fcRate", "whtPct", "servicePct", "edsPct", "courierPct", "interestPct", "profit", "packagingMaterial", "defaultFreight", "bagDollarRate", "bagOverheadPct"] as const;

export async function GET() {
  try {
    const { data, error } = await supabase.from("rice_settings").select("key, value");
    if (error) throw error;

    const s: Record<string, string> = {};
    for (const row of data ?? []) { if (row.key) s[row.key] = row.value ?? ""; }

    const num = (k: string, d: number) => (s[k] !== undefined && s[k] !== "" ? parseFloat(s[k]) : d);
    return Response.json({
      fcRate: num("fcRate", RICE_DEFAULT_SETTINGS.fcRate),
      whtPct: num("whtPct", RICE_DEFAULT_SETTINGS.whtPct),
      servicePct: num("servicePct", RICE_DEFAULT_SETTINGS.servicePct),
      edsPct: num("edsPct", RICE_DEFAULT_SETTINGS.edsPct),
      courierPct: num("courierPct", RICE_DEFAULT_SETTINGS.courierPct),
      interestPct: num("interestPct", RICE_DEFAULT_SETTINGS.interestPct),
      profit: num("profit", RICE_DEFAULT_SETTINGS.profit),
      packagingMaterial: num("packagingMaterial", RICE_DEFAULT_SETTINGS.packagingMaterial),
      defaultFreight: num("defaultFreight", RICE_DEFAULT_SETTINGS.defaultFreight),
      bagDollarRate: num("bagDollarRate", RICE_DEFAULT_SETTINGS.bagDollarRate),
      bagOverheadPct: num("bagOverheadPct", RICE_DEFAULT_SETTINGS.bagOverheadPct),
    });
  } catch {
    return Response.json(RICE_DEFAULT_SETTINGS);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string | number>;

    const rows: { key: string; value: string }[] = [];
    for (const key of KEYS) {
      if (body[key] === undefined) continue;
      rows.push({ key, value: String(body[key]) });
    }

    if (rows.length) {
      // Upsert each setting by key
      const { error } = await supabase
        .from("rice_settings")
        .upsert(rows, { onConflict: "key" });
      if (error) throw error;
    }

    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
