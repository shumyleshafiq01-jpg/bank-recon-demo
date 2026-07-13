import { supabase } from "@/lib/supabase";

/** Map a Supabase snake_case row to the camelCase shape the frontend expects. */
function toClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    quoteNo: row.quote_no ?? "",
    clientName: row.client_name ?? "",
    clientContact: row.client_contact ?? "",
    destination: row.destination ?? "",
    country: row.country ?? "",
    generatedAt: row.generated_at ?? "",
    validTill: row.valid_till ?? "",
    status: row.status ?? "active",
    createdBy: row.created_by ?? "",
    brandKafi: row.brand_kafi ?? true,
    brandEssence: row.brand_essence ?? false,
    notes: row.notes ?? "",
    productsSnapshot: row.products_snapshot ?? [],
    quoteType: (row.quote_type || "CNF") as "CNF" | "FOB",
    discountType: (row.discount_type || "none") as "none" | "percent" | "amount",
    discountScope: (row.discount_scope || "all") as "all" | "specific",
    discountValue: row.discount_value ?? 0,
    discountAmount: row.discount_amount ?? 0,
    discountProductIds: row.discount_product_ids ?? [],
    shipmentPort: row.shipment_port || "Karachi Port",
    shippingMode: row.shipping_mode || "By Sea",
    leadTime: row.lead_time || "30 to 35 Working Days",
  };
}

async function nextQuoteNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CNF-${year}-`;
  const { data } = await supabase
    .from("cnf_quotes")
    .select("quote_no")
    .like("quote_no", `${prefix}%`);

  const nums = (data ?? [])
    .map((r) => parseInt(String(r.quote_no).split("-")[2] ?? "0", 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("cnf_quotes").select("*");
    if (error) throw error;
    return Response.json({ quotes: (data ?? []).map(toClient) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action: "create" | "archive" | "unarchive" | "delete" | "deleteMany";
      quote?: Record<string, unknown>;
      id?: string;
      ids?: string[];
    };

    if (body.action === "create" && body.quote) {
      const q = body.quote;
      const id = crypto.randomUUID();
      const quoteNo = await nextQuoteNo();
      const now = new Date().toISOString();

      const { error } = await supabase.from("cnf_quotes").insert({
        id,
        quote_no: quoteNo,
        client_name: q.clientName ?? "",
        client_contact: q.clientContact ?? "",
        destination: q.destination ?? "",
        country: q.country ?? "",
        generated_at: now,
        valid_till: q.validTill ?? "",
        status: "active",
        created_by: q.createdBy ?? "",
        brand_kafi: q.brandKafi !== false,
        brand_essence: q.brandEssence === true,
        notes: q.notes ?? "",
        products_snapshot: q.productsSnapshot ?? [],
        quote_type: q.quoteType ?? "CNF",
        discount_type: q.discountType ?? "none",
        discount_scope: q.discountScope ?? "all",
        discount_value: q.discountValue ?? 0,
        discount_amount: q.discountAmount ?? 0,
        discount_product_ids: q.discountProductIds ?? [],
        shipment_port: q.shipmentPort ?? "Karachi Port",
        shipping_mode: q.shippingMode ?? "By Sea",
        lead_time: q.leadTime ?? "30 to 35 Working Days",
      });
      if (error) throw error;
      return Response.json({ saved: true, id, quoteNo });
    }

    if ((body.action === "archive" || body.action === "unarchive") && body.id) {
      const newStatus = body.action === "archive" ? "archived" : "active";
      const { error } = await supabase
        .from("cnf_quotes")
        .update({ status: newStatus })
        .eq("id", body.id);
      if (error) throw error;
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("cnf_quotes").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ deleted: true });
    }

    if (body.action === "deleteMany" && Array.isArray(body.ids)) {
      const ids = body.ids.filter(Boolean);
      if (ids.length === 0) return Response.json({ deleted: 0 });
      const { error, count } = await supabase
        .from("cnf_quotes")
        .delete({ count: "exact" })
        .in("id", ids);
      if (error) throw error;
      return Response.json({ deleted: count ?? ids.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
