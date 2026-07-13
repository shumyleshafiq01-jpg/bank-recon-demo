import { supabase } from "@/lib/supabase";

type Frequency = "one-time" | "daily" | "weekly" | "monthly" | "annual";

function targetMatchesRole(target: string, role: string): boolean {
  if (target === "all") return true;
  if (target === "both") return role === "aa1" || role === "aa2";
  return target === role;
}

function isDoneForNow(frequency: Frequency, markedAt: string): boolean {
  if (!markedAt) return false;
  const marked = new Date(markedAt);
  const now = new Date();
  if (frequency === "one-time") return true;
  if (frequency === "daily") {
    const diffMs = now.getTime() - marked.getTime();
    return diffMs < 24 * 60 * 60 * 1000;
  }
  if (frequency === "weekly") {
    const diffMs = now.getTime() - marked.getTime();
    return diffMs < 7 * 24 * 60 * 60 * 1000;
  }
  if (frequency === "monthly") {
    return marked.getFullYear() === now.getFullYear() && marked.getMonth() === now.getMonth();
  }
  if (frequency === "annual") {
    return marked.getFullYear() === now.getFullYear();
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const [remRes, doneRes] = await Promise.all([
      supabase.from("reminders").select("*").eq("active", true),
      supabase.from("reminders_done").select("*"),
    ]);

    if (remRes.error) throw new Error(remRes.error.message);
    if (doneRes.error) throw new Error(doneRes.error.message);

    const reminders = (remRes.data ?? []).map((r) => ({
      id: r.id as string,
      message: r.message as string,
      target: r.target as string,
      dueDate: (r.due_date as string) ?? "",
      frequency: ((r.frequency as string) || "one-time") as Frequency,
      createdAt: (r.created_at as string) ?? "",
      active: true,
    }));

    const done = (doneRes.data ?? []).map((r) => ({
      reminderId: r.reminder_id as string,
      role: r.role as string,
      markedAt: (r.marked_at as string) ?? "",
    }));

    if (role && role !== "accountant-manage") {
      // Return pending reminders for this specific role
      const pending = reminders.filter((rem) => {
        if (!targetMatchesRole(rem.target, role)) return false;
        const latestDone = done
          .filter((d) => d.reminderId === rem.id && d.role === role)
          .sort((a, b) => b.markedAt.localeCompare(a.markedAt))[0];
        if (!latestDone) return true;
        return !isDoneForNow(rem.frequency, latestDone.markedAt);
      });
      return Response.json({ reminders: pending });
    }

    // Accountant manage view — return all + done summary
    const doneSummary = reminders.map((rem) => {
      const targets = rem.target === "all" ? ["accountant", "aa1", "aa2"]
        : rem.target === "both" ? ["aa1", "aa2"]
        : [rem.target];
      const doneCount = targets.filter((r) => {
        const latestDone = done
          .filter((d) => d.reminderId === rem.id && d.role === r)
          .sort((a, b) => b.markedAt.localeCompare(a.markedAt))[0];
        return latestDone && isDoneForNow(rem.frequency, latestDone.markedAt);
      }).length;
      return { reminderId: rem.id, doneCount, totalCount: targets.length };
    });

    return Response.json({ reminders, doneSummary });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      message: string; target: string; dueDate: string; frequency: string;
    };
    const id = Math.random().toString(36).slice(2, 10);
    const { error } = await supabase.from("reminders").insert({
      id,
      message: body.message,
      target: body.target,
      due_date: body.dueDate,
      frequency: body.frequency,
      created_at: new Date().toISOString(),
      active: true,
    });
    if (error) throw new Error(error.message);
    return Response.json({ created: true, id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { action: string; reminderId: string; role?: string };

    if (body.action === "done") {
      const { error } = await supabase.from("reminders_done").upsert({
        reminder_id: body.reminderId,
        role: body.role ?? "",
        marked_at: new Date().toISOString(),
      }, { onConflict: "reminder_id,role" });
      if (error) throw new Error(error.message);
      return Response.json({ marked: true });
    }

    if (body.action === "update") {
      const { reminderId, message, target, dueDate, frequency } = body as unknown as {
        action: string; reminderId: string; message: string; target: string; dueDate: string; frequency: string;
      };
      const { error } = await supabase
        .from("reminders")
        .update({ message, target, due_date: dueDate, frequency })
        .eq("id", reminderId);
      if (error) throw new Error(error.message);
      return Response.json({ updated: true });
    }

    if (body.action === "reset") {
      const { error } = await supabase
        .from("reminders_done")
        .delete()
        .eq("reminder_id", body.reminderId);
      if (error) throw new Error(error.message);
      return Response.json({ reset: true });
    }

    if (body.action === "deactivate") {
      const { error } = await supabase
        .from("reminders")
        .update({ active: false })
        .eq("id", body.reminderId);
      if (error) throw new Error(error.message);
      return Response.json({ deactivated: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { reminderId: string };

    // Delete done records and the reminder itself
    const [doneRes, remRes] = await Promise.all([
      supabase.from("reminders_done").delete().eq("reminder_id", body.reminderId),
      supabase.from("reminders").delete().eq("id", body.reminderId),
    ]);

    if (doneRes.error) throw new Error(doneRes.error.message);
    if (remRes.error) throw new Error(remRes.error.message);

    return Response.json({ deleted: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
