import { supabase } from "@/lib/supabase";

const TABLE = "pl_settings";

const DEFAULTS: Record<string, string | number> = {
  fcRate: 275,
  currency: "PKR",
  targetCurrency: "USD",
  adminPct: 5,
  whtPct: 2,
  serviceCharges: 0,
  eds: 0,
  courierCharges: 0,
};

export async function GET() {
  try {
    const { data, error } = await supabase.from(TABLE).select();
    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.key) settings[row.key] = row.value ?? "";
    }

    return Response.json({
      fcRate: parseFloat(settings.fcRate || "275") || 275,
      currency: settings.currency || "PKR",
      targetCurrency: settings.targetCurrency || "USD",
      adminPct: parseFloat(settings.adminPct || "5") || 5,
      whtPct: parseFloat(settings.whtPct || "2") || 2,
      serviceCharges: parseFloat(settings.serviceCharges || "0") || 0,
      eds: parseFloat(settings.eds || "0") || 0,
      courierCharges: parseFloat(settings.courierCharges || "0") || 0,
    });
  } catch (err) {
    return Response.json({
      fcRate: 275, currency: "PKR", targetCurrency: "USD",
      adminPct: 5, whtPct: 2, serviceCharges: 0, eds: 0, courierCharges: 0,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string | number>;

    const rows = Object.entries(body).map(([key, value]) => ({
      key,
      value: String(value),
    }));

    // Upsert each key-value pair (key is the primary key)
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "key" });
    if (error) throw error;

    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
