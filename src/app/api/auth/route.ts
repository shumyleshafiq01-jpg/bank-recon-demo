import { supabase } from "@/lib/supabase";
import { createSession, destroySession, getSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action: string; username?: string; pin?: string; newPin?: string };

    if (body.action === "login") {
      const raw = (body.username ?? "").trim();
      if (!raw || !body.pin) {
        return Response.json({ error: "Username and PIN required" }, { status: 400 });
      }

      // Accept exact case or all-lowercase only
      const { data: rows } = await supabase
        .from("staff")
        .select("id, username, display_name, pin, role, must_change_pin, active")
        .eq("active", true);

      const staff = (rows ?? []).find(r => {
        const u = r.username as string;
        return raw === u || raw === u.toLowerCase();
      });

      if (!staff || staff.pin !== body.pin) {
        return Response.json({ error: "Invalid username or PIN" }, { status: 401 });
      }

      await createSession(staff.id);

      return Response.json({
        ok: true,
        user: {
          id: staff.id,
          username: staff.username,
          displayName: staff.display_name,
          role: staff.role,
          mustChangePin: staff.must_change_pin,
        },
      });
    }

    if (body.action === "logout") {
      await destroySession();
      return Response.json({ ok: true });
    }

    if (body.action === "me") {
      const session = await getSession();
      if (!session) return Response.json({ user: null });
      return Response.json({ user: session });
    }

    if (body.action === "change-pin") {
      const session = await getSession();
      if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

      const newPin = (body.newPin ?? "").trim();
      if (!newPin || newPin.length < 4) {
        return Response.json({ error: "PIN must be at least 4 characters" }, { status: 400 });
      }
      if (newPin === "1111") {
        return Response.json({ error: "Choose a different PIN" }, { status: 400 });
      }

      const { error } = await supabase
        .from("staff")
        .update({ pin: newPin, must_change_pin: false })
        .eq("id", session.id);

      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ user: null });
  return Response.json({ user: session });
}
