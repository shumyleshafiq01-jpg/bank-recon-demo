import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Master document data + line items for a shipment. GET auto-creates an
// empty master row (seeded from the shipment) the first time it's opened.

const MASTER_FIELDS = [
  "pi_number", "pi_date", "custom_invoice_no", "custom_invoice_date",
  "commercial_invoice_no", "commercial_invoice_date", "consignee_custom", "consignee_actual",
  "buyer_address", "notify_party", "container_no", "form_e_no", "terms", "bl_no", "bl_date",
  "vessel", "on_board", "destination", "no_of_containers", "no_of_packages", "description",
  "net_weight_mt", "gross_weight_mt", "net_weight_kgs", "gross_weight_kgs",
  "freight_label", "freight_amount", "listing_fee_label", "listing_fee_amount",
  "terms_of_sale", "bank_name", "bank_account_name", "bank_account_no", "bank_iban", "bank_swift",
  "coo_exporter", "coo_membership_no", "coo_reference_no",
];

const LINE_FIELDS = [
  "line_no", "line_type", "product_name", "packing_spec", "per_ctn_weight_kg",
  "total_cartons", "total_net_kg", "hs_code", "unit_price", "unit_basis", "amount", "note_text", "sort_order",
];

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const shipmentId = url.searchParams.get("shipmentId");
    if (!shipmentId) return Response.json({ error: "shipmentId required" }, { status: 400 });

    let { data: master } = await supabase.from("export_doc_master").select("*").eq("shipment_id", shipmentId).single();

    if (!master) {
      // Seed a master row from the shipment's existing fields.
      const { data: shipment } = await supabase.from("export_shipments").select("*").eq("id", shipmentId).single();
      const { data: created, error } = await supabase
        .from("export_doc_master")
        .insert({
          shipment_id: shipmentId,
          pi_number: shipment?.pi_number ?? null,
          consignee_custom: shipment?.buyer_name ?? null,
          consignee_actual: shipment?.buyer_name ?? null,
          terms: shipment?.advance_payment_pct === 100 ? "100% PAYMENT TO BE RECEIVE ON CAD" : null,
          bank_name: "ALLIED BANK LIMITED. KARACHI-PAKISTAN.",
          bank_account_name: "KAFI COMMODITIES (PVT) LTD",
          coo_exporter: "KAFI COMMODITIES (PVT) LTD.,\nF-50/1, BLOCK-8, KDA SCHEME # 5,\nCLIFTON, KARACHI-PAKISTAN.",
        })
        .select("*")
        .single();
      if (error) throw error;
      master = created;
    }

    const { data: lines } = await supabase.from("export_doc_lines").select("*").eq("master_id", master.id).order("sort_order");
    return Response.json({ master, lines: lines ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "update-master" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const f of MASTER_FIELDS) if (body[f] !== undefined) updates[f] = body[f] === "" ? null : body[f];
      const { error } = await supabase.from("export_doc_master").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "add-line" && body.masterId) {
      const { count } = await supabase.from("export_doc_lines").select("id", { count: "exact", head: true }).eq("master_id", body.masterId);
      const { data, error } = await supabase
        .from("export_doc_lines")
        .insert({ master_id: body.masterId, line_type: body.lineType || "product", sort_order: count ?? 0, line_no: (count ?? 0) + 1 })
        .select("*").single();
      if (error) throw error;
      return Response.json({ ok: true, line: data });
    }

    if (body.action === "update-line" && body.id) {
      const updates: Record<string, unknown> = {};
      for (const f of LINE_FIELDS) if (body[f] !== undefined) updates[f] = body[f] === "" ? null : body[f];
      const { error } = await supabase.from("export_doc_lines").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-line" && body.id) {
      const { error } = await supabase.from("export_doc_lines").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
