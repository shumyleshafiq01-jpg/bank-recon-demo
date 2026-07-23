import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("export_doc_templates").select("*").order("label");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (body.action === "create") {
      const { data, error } = await supabase
        .from("export_doc_templates")
        .insert({
          label: body.label || "Untitled Template",
          country: body.country || null,
          buyer_name: body.buyerName || null,
          sop_method: body.sopMethod || "courier",
          document_types: body.documentTypes || [],
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.label !== undefined) updates.label = body.label;
      if (body.country !== undefined) updates.country = body.country;
      if (body.buyerName !== undefined) updates.buyer_name = body.buyerName;
      if (body.sopMethod !== undefined) updates.sop_method = body.sopMethod;
      if (body.documentTypes !== undefined) updates.document_types = body.documentTypes;
      const { error } = await supabase.from("export_doc_templates").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("export_doc_templates").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
