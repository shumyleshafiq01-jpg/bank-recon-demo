import { supabase } from "@/lib/supabase";

const DEFAULTS: Record<string, string[]> = {
  supplier_categories: ["Fried Onion","Spices","Paste / Pickle / Chutney","Sauces & Mayo","Vermicelli","Pheni / Bakery","Custard & Jelly","Fresh Vegetables","Food Technologist","Packaging","Logistics / Transport","Other"],
  vendor_banks: ["MEEZAN","HMB","ABL","HBL","UBL","MCB","SCB","FAYSAL","BAH (BAHL)","ASKARI","SILK BANK","BANK ISLAMI","ALLIED","DIB","JS BANK","Other"],
};

export async function GET() {
  try {
    const { data, error } = await supabase.from("directory_config").select("*");
    if (error) throw new Error(error.message);

    const cfg: Record<string, string[]> = { ...DEFAULTS };
    for (const row of data ?? []) {
      if (row.key && row.value) {
        try {
          cfg[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        } catch { /* ignore parse errors */ }
      }
    }
    return Response.json(cfg);
  } catch {
    return Response.json(DEFAULTS);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { key: string; values: string[] };
    const { error } = await supabase
      .from("directory_config")
      .upsert({ key: body.key, value: JSON.stringify(body.values) }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return Response.json({ saved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
