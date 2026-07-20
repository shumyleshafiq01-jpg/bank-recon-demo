import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent } from "@/lib/sc-notify";

function sessionNumber(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `PACK-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("id");

    if (sessionId) {
      const { data: sess, error: sErr } = await supabase.from("sc_packing_sessions").select("*").eq("id", sessionId).single();
      if (sErr) throw sErr;
      const { data: items, error: iErr } = await supabase.from("sc_packing_session_items").select("*").eq("session_id", sessionId).order("sort_order");
      if (iErr) throw iErr;
      const { data: photos, error: pErr } = await supabase.from("sc_packing_photos").select("*").eq("session_id", sessionId).order("created_at");
      if (pErr) throw pErr;
      return Response.json({ session: sess, items: items ?? [], photos: photos ?? [] });
    }

    const { data, error } = await supabase.from("sc_packing_sessions").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    const ids = (data ?? []).map(s => s.id);
    let itemsBySession: Record<string, unknown[]> = {};
    if (ids.length > 0) {
      const { data: allItems } = await supabase.from("sc_packing_session_items").select("*").in("session_id", ids);
      itemsBySession = (allItems ?? []).reduce((acc: Record<string, unknown[]>, it) => {
        (acc[it.session_id as string] ||= []).push(it);
        return acc;
      }, {});
    }

    return Response.json({ sessions: (data ?? []).map(s => ({ ...s, items: itemsBySession[s.id] ?? [] })) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Start a packing session from a BOM's finished-goods lines
    if (body.action === "create-from-bom" && body.bomId) {
      const { data: bom, error: bErr } = await supabase.from("sc_boms").select("*").eq("id", body.bomId).single();
      if (bErr) throw bErr;

      const { data: bomItems, error: biErr } = await supabase
        .from("sc_bom_items").select("*").eq("bom_id", body.bomId).order("sort_order");
      if (biErr) throw biErr;

      const { count } = await supabase.from("sc_packing_sessions").select("id", { count: "exact", head: true });

      const { data: sess, error: sErr } = await supabase
        .from("sc_packing_sessions")
        .insert({
          session_number: sessionNumber((count ?? 0) + 1),
          bom_id: bom.id,
          buyer_name: bom.buyer_name,
          container_type: bom.container_type,
          status: "in_progress",
          created_by: session.id,
        })
        .select("*")
        .single();
      if (sErr) throw sErr;

      const rows = (bomItems ?? []).map((it, i) => ({
        session_id: sess.id,
        product_id: it.product_id,
        product_name: it.product_name,
        packing_desc: it.packing_desc,
        cartons_expected: it.cartons_required,
        cartons_packed: 0,
        remarks: "",
        sort_order: i,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("sc_packing_session_items").insert(rows);
        if (insErr) throw insErr;
      }

      return Response.json({ ok: true, id: sess.id });
    }

    // Update packed quantities / remarks per item
    if (body.action === "save-items" && Array.isArray(body.items)) {
      for (const it of body.items) {
        const { error } = await supabase
          .from("sc_packing_session_items")
          .update({ cartons_packed: Number(it.cartonsPacked || 0), remarks: it.remarks || "" })
          .eq("id", it.id);
        if (error) throw error;
      }
      return Response.json({ ok: true });
    }

    // Attach an uploaded photo (URL already hosted via the shared upload-image route)
    if (body.action === "add-photo" && body.sessionId && body.url) {
      const { error } = await supabase.from("sc_packing_photos").insert({
        session_id: body.sessionId, url: body.url, caption: body.caption || "", uploaded_by: session.id,
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete-photo" && body.id) {
      const { error } = await supabase.from("sc_packing_photos").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "update-notes" && body.id) {
      const { error } = await supabase.from("sc_packing_sessions").update({ notes: body.notes || "", updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    // Mark the session packed/loaded — fires the packing_done notification
    if (body.action === "complete" && body.id) {
      const { data: sess, error: sErr } = await supabase.from("sc_packing_sessions").select("*").eq("id", body.id).single();
      if (sErr) throw sErr;
      if (sess.status === "completed") return Response.json({ error: "Already marked complete" }, { status: 409 });

      const { data: items } = await supabase.from("sc_packing_session_items").select("*").eq("session_id", body.id);
      const totalExpected = (items ?? []).reduce((s, it) => s + Number(it.cartons_expected || 0), 0);
      const totalPacked = (items ?? []).reduce((s, it) => s + Number(it.cartons_packed || 0), 0);

      const { error: updErr } = await supabase
        .from("sc_packing_sessions")
        .update({ status: "completed", completed_by: session.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", body.id);
      if (updErr) throw updErr;

      const notified = await notifyEvent({
        event: "packing_done",
        refId: sess.id,
        text: `*KAFI — PACKING COMPLETE*\n${sess.session_number}${sess.buyer_name ? ` — ${sess.buyer_name}` : ""}\n${totalPacked} of ${totalExpected} cartons packed · ${sess.container_type.toUpperCase()}.`,
        subject: `Packing complete — ${sess.session_number}`,
      });

      return Response.json({ ok: true, notified, totalPacked, totalExpected });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_packing_sessions").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
