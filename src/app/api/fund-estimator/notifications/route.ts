import { supabase } from "@/lib/supabase";

/** Map a Supabase notification row to the camelCase shape the frontend expects. */
function notifToClient(row: Record<string, unknown>) {
  return {
    id: row.id ?? "",
    message: row.message ?? "",
    target: row.target ?? "",
    createdAt: row.created_at ?? "",
    active: row.active ?? true,
  };
}

/** Map a Supabase done row to the camelCase shape the frontend expects. */
function doneToClient(row: Record<string, unknown>) {
  return {
    notifId: row.notif_id ?? "",
    role: row.role ?? "",
    markedAt: row.marked_at ?? "",
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const [notifRes, doneRes] = await Promise.all([
      supabase.from("fe_notifications").select("*").eq("active", true),
      supabase.from("fe_notif_done").select("*"),
    ]);
    if (notifRes.error) throw notifRes.error;
    if (doneRes.error) throw doneRes.error;

    const notifications = (notifRes.data ?? []).map(notifToClient);
    const done = (doneRes.data ?? []).map(doneToClient);

    if (role === "aa1" || role === "aa2") {
      const doneIds = new Set(done.filter((d) => d.role === role).map((d) => d.notifId));
      const pending = notifications.filter(
        (n) => (n.target === role || n.target === "both") && !doneIds.has(n.id as string),
      );
      return Response.json({ notifications: pending });
    }

    // Accountant — return all with done info
    return Response.json({ notifications, done });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message: string; target: string };
    const id = Math.random().toString(36).slice(2, 10);
    const createdAt = new Date().toISOString();

    const { error } = await supabase.from("fe_notifications").insert({
      id,
      message: body.message,
      target: body.target,
      created_at: createdAt,
      active: true,
    });
    if (error) throw error;
    return Response.json({ created: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { action: string; notifId: string; role?: string };

    if (body.action === "done") {
      const { error } = await supabase.from("fe_notif_done").insert({
        notif_id: body.notifId,
        role: body.role ?? "",
        marked_at: new Date().toISOString(),
      });
      if (error) throw error;
      return Response.json({ marked: true });
    }

    if (body.action === "reset") {
      const { error } = await supabase
        .from("fe_notif_done")
        .delete()
        .eq("notif_id", body.notifId);
      if (error) throw error;
      return Response.json({ reset: true });
    }

    if (body.action === "deactivate") {
      const { error } = await supabase
        .from("fe_notifications")
        .update({ active: false })
        .eq("id", body.notifId);
      if (error) throw error;
      return Response.json({ deactivated: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { notifId: string };

    // Delete done records first, then the notification
    const { error: doneErr } = await supabase
      .from("fe_notif_done")
      .delete()
      .eq("notif_id", body.notifId);
    if (doneErr) throw doneErr;

    const { error } = await supabase
      .from("fe_notifications")
      .delete()
      .eq("id", body.notifId);
    if (error) throw error;

    return Response.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
