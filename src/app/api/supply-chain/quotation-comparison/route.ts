import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Supply-chain-specific quotation comparison — separate from the general
// AI-PDF-extraction /quotations tool. This one is plain manual entry
// (vendor + rate + note), persisted, and tied directly to a BOM raw
// material so the winner can be written straight back onto the BOM line.

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const bomMaterialId = url.searchParams.get("bomMaterialId");

    if (bomMaterialId) {
      const { data, error } = await supabase
        .from("sc_material_quotations").select("*").eq("bom_material_id", bomMaterialId).order("created_at", { ascending: false });
      if (error) throw error;
      return Response.json({ quotations: data ?? [] });
    }

    // Every material across every BOM currently in "Ask for Quotes" mode —
    // this is the queue the Quotation Comparison page shows.
    const { data: materials, error: mErr } = await supabase
      .from("sc_bom_materials")
      .select("*, sc_boms(bom_name, buyer_name)")
      .eq("procurement_mode", "query")
      .is("po_id", null)
      .order("created_at", { ascending: false });
    if (mErr) throw mErr;

    const ids = (materials ?? []).map(m => m.id);
    let quotesByMaterial: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: quotes } = await supabase.from("sc_material_quotations").select("*").in("bom_material_id", ids).order("created_at", { ascending: false });
      quotesByMaterial = (quotes ?? []).reduce((acc: Record<string, unknown[]>, q) => {
        (acc[q.bom_material_id as string] ||= []).push(q);
        return acc;
      }, {});
    }

    return Response.json({ materials: (materials ?? []).map(m => ({ ...m, quotations: quotesByMaterial[m.id] ?? [] })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "add" && body.bomMaterialId && body.vendorName) {
      const { error } = await supabase.from("sc_material_quotations").insert({
        bom_material_id: body.bomMaterialId,
        vendor_id: body.vendorId || null,
        vendor_name: body.vendorName,
        rate: Number(body.rate || 0),
        note: body.note || "",
        created_by: session.id,
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_material_quotations").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Picking a winner writes its rate + vendor straight back onto the BOM
    // material line, same as if Hafeez had typed them in directly — the
    // line is now ready for "Send PO".
    if (body.action === "select-winner" && body.id && body.bomMaterialId) {
      const { data: quote, error: qErr } = await supabase.from("sc_material_quotations").select("*").eq("id", body.id).single();
      if (qErr) throw qErr;

      await supabase.from("sc_material_quotations").update({ is_winner: false }).eq("bom_material_id", body.bomMaterialId);
      const { error: winErr } = await supabase.from("sc_material_quotations").update({ is_winner: true }).eq("id", body.id);
      if (winErr) throw winErr;

      const { error: matErr } = await supabase
        .from("sc_bom_materials")
        .update({ rate: quote.rate, vendor_id: quote.vendor_id, vendor_name: quote.vendor_name })
        .eq("id", body.bomMaterialId);
      if (matErr) throw matErr;

      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
