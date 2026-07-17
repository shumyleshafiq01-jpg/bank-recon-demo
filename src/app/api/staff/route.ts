import { supabase } from "@/lib/supabase";
import { getSession, getStaffModules } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "super_admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("staff")
      .select("id, username, display_name, role, must_change_pin, active, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const staff = await Promise.all(
      (data ?? []).map(async (s) => ({
        id: s.id,
        username: s.username,
        displayName: s.display_name,
        role: s.role,
        mustChangePin: s.must_change_pin,
        active: s.active,
        modules: await getStaffModules(s.id),
      }))
    );

    return Response.json({ staff });
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

    const body = await request.json() as {
      action: string;
      staffId?: string;
      username?: string;
      displayName?: string;
      role?: string;
      active?: boolean;
      moduleSlug?: string;
      allowed?: boolean;
      modules?: Record<string, boolean>;
    };

    if (body.action === "add") {
      const username = (body.username ?? "").trim().toLowerCase();
      const displayName = (body.displayName ?? "").trim();
      if (!username || !displayName) {
        return Response.json({ error: "Username and display name required" }, { status: 400 });
      }

      const { error } = await supabase.from("staff").insert({
        username,
        display_name: displayName,
        pin: "1111",
        role: body.role || "staff",
        must_change_pin: true,
        active: true,
      });

      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          return Response.json({ error: "Username already exists" }, { status: 409 });
        }
        throw error;
      }
      return Response.json({ ok: true });
    }

    if (body.action === "update" && body.staffId) {
      const updates: Record<string, unknown> = {};
      if (body.displayName !== undefined) updates.display_name = body.displayName;
      if (body.role !== undefined) updates.role = body.role;
      if (body.active !== undefined) updates.active = body.active;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("staff").update(updates).eq("id", body.staffId);
        if (error) throw error;
      }
      return Response.json({ ok: true });
    }

    if (body.action === "reset-pin" && body.staffId) {
      const { error } = await supabase
        .from("staff")
        .update({ pin: "1111", must_change_pin: true })
        .eq("id", body.staffId);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "set-module" && body.staffId && body.moduleSlug) {
      const { error } = await supabase.from("staff_modules").upsert(
        { staff_id: body.staffId, module_slug: body.moduleSlug, allowed: body.allowed ?? true },
        { onConflict: "staff_id,module_slug" }
      );
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (body.action === "set-modules" && body.staffId && body.modules) {
      const rows = Object.entries(body.modules).map(([slug, allowed]) => ({
        staff_id: body.staffId!,
        module_slug: slug,
        allowed,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("staff_modules").upsert(rows, { onConflict: "staff_id,module_slug" });
        if (error) throw error;
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
