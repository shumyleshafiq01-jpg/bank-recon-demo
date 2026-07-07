import { ensureSheet, readSheet, writeRows, updateRow, deleteRow } from "@/lib/google-sheets";

const REMINDERS_SHEET = "Reminders";
const DONE_SHEET = "RemindersDone";

const REMINDERS_HEADERS = ["id", "message", "target", "dueDate", "frequency", "createdAt", "active"];
const DONE_HEADERS = ["reminderId", "role", "markedAt"];

type Frequency = "one-time" | "daily" | "weekly" | "monthly" | "annual";

async function init() {
  await ensureSheet(REMINDERS_SHEET, REMINDERS_HEADERS);
  await ensureSheet(DONE_SHEET, DONE_HEADERS);
}

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
    await init();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const rows = await readSheet(REMINDERS_SHEET);
    const doneRows = await readSheet(DONE_SHEET);

    const reminders = rows.slice(1).filter((r) => r[0] && r[6] === "true").map((r) => ({
      id: r[0], message: r[1], target: r[2], dueDate: r[3],
      frequency: (r[4] || "one-time") as Frequency, createdAt: r[5], active: true,
    }));

    const done = doneRows.slice(1).filter((r) => r[0]).map((r) => ({
      reminderId: r[0], role: r[1], markedAt: r[2],
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
    await init();
    const body = await request.json() as {
      message: string; target: string; dueDate: string; frequency: string;
    };
    const id = Math.random().toString(36).slice(2, 10);
    await writeRows(REMINDERS_SHEET, [[id, body.message, body.target, body.dueDate, body.frequency, new Date().toISOString(), "true"]]);
    return Response.json({ created: true, id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; reminderId: string; role?: string };

    if (body.action === "done") {
      await writeRows(DONE_SHEET, [[body.reminderId, body.role ?? "", new Date().toISOString()]]);
      return Response.json({ marked: true });
    }

    if (body.action === "update") {
      const { reminderId, message, target, dueDate, frequency } = body as unknown as {
        action: string; reminderId: string; message: string; target: string; dueDate: string; frequency: string;
      };
      const rows = await readSheet(REMINDERS_SHEET);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === reminderId) {
          rows[i][1] = message;
          rows[i][2] = target;
          rows[i][3] = dueDate;
          rows[i][4] = frequency;
          await updateRow(REMINDERS_SHEET, i + 1, rows[i]);
          break;
        }
      }
      return Response.json({ updated: true });
    }

    if (body.action === "reset") {
      const rows = await readSheet(DONE_SHEET);
      const toDelete: number[] = [];
      for (let i = 1; i < rows.length; i++) if (rows[i][0] === body.reminderId) toDelete.push(i + 1);
      for (const ri of toDelete.sort((a, b) => b - a)) await deleteRow(DONE_SHEET, ri);
      return Response.json({ reset: true });
    }

    if (body.action === "deactivate") {
      const rows = await readSheet(REMINDERS_SHEET);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.reminderId) { rows[i][6] = "false"; await updateRow(REMINDERS_SHEET, i + 1, rows[i]); break; }
      }
      return Response.json({ deactivated: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await init();
    const body = await request.json() as { reminderId: string };
    const rows = await readSheet(REMINDERS_SHEET);
    const remIdx = rows.findIndex((r, i) => i > 0 && r[0] === body.reminderId);
    if (remIdx > 0) await deleteRow(REMINDERS_SHEET, remIdx + 1);
    const doneRows = await readSheet(DONE_SHEET);
    const doneToDelete: number[] = [];
    for (let i = 1; i < doneRows.length; i++) if (doneRows[i][0] === body.reminderId) doneToDelete.push(i + 1);
    for (const ri of doneToDelete.sort((a, b) => b - a)) await deleteRow(DONE_SHEET, ri);
    return Response.json({ deleted: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
