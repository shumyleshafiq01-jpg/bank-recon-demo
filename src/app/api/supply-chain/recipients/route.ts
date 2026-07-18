import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// Team recipients for the supply chain notification timeline.
// Each person subscribes to workflow events (notify) and can be flagged
// as approver for gated steps. Managed from the Integrations panel.

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("sc_recipients")
      .select("*, staff(username, display_name)")
      .eq("active", true)
      .order("created_at");
    if (error) throw error;

    return Response.json({ recipients: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "super_admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    if (body.action === "add") {
      if (!body.name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });
      const { error } = await supabase.from("sc_recipients").insert({
        name: body.name.trim(),
        designation: body.designation || "",
        whatsapp: body.whatsapp || "",
        email: body.email || "",
        staff_id: body.staffId || null,
        notify_events: Array.isArray(body.notifyEvents) ? body.notifyEvents : [],
        approver_events: Array.isArray(body.approverEvents) ? body.approverEvents : [],
      });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.designation !== undefined) updates.designation = body.designation;
      if (body.whatsapp !== undefined) updates.whatsapp = body.whatsapp;
      if (body.email !== undefined) updates.email = body.email;
      if (body.staffId !== undefined) updates.staff_id = body.staffId || null;
      if (body.notifyEvents !== undefined) updates.notify_events = body.notifyEvents;
      if (body.approverEvents !== undefined) updates.approver_events = body.approverEvents;
      const { error } = await supabase.from("sc_recipients").update(updates).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_recipients").update({ active: false }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
