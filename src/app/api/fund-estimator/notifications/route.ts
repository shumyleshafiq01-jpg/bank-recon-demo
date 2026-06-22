import { ensureSheet, readSheet, writeRows, clearAndWrite } from "@/lib/google-sheets";

const NOTIF_SHEET = "FE_Notifications";
const DONE_SHEET = "FE_NotifDone";

const NOTIF_HEADERS = ["id", "message", "target", "createdAt", "active"];
const DONE_HEADERS = ["notifId", "role", "markedAt"];

async function init() {
  await ensureSheet(NOTIF_SHEET, NOTIF_HEADERS);
  await ensureSheet(DONE_SHEET, DONE_HEADERS);
}

export async function GET(request: Request) {
  try {
    await init();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    const notifRows = await readSheet(NOTIF_SHEET);
    const doneRows = await readSheet(DONE_SHEET);

    const notifications = notifRows.slice(1)
      .filter((r) => r[4] === "true")
      .map((r) => ({
        id: r[0] ?? "",
        message: r[1] ?? "",
        target: r[2] ?? "",
        createdAt: r[3] ?? "",
        active: true,
      }));

    const done = doneRows.slice(1).map((r) => ({
      notifId: r[0] ?? "",
      role: r[1] ?? "",
      markedAt: r[2] ?? "",
    }));

    if (role === "aa1" || role === "aa2") {
      const doneIds = new Set(done.filter((d) => d.role === role).map((d) => d.notifId));
      const pending = notifications.filter(
        (n) => (n.target === role || n.target === "both") && !doneIds.has(n.id)
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
    await init();
    const body = await request.json() as { message: string; target: string };
    const id = Math.random().toString(36).slice(2, 10);
    const createdAt = new Date().toISOString();
    await writeRows(NOTIF_SHEET, [[id, body.message, body.target, createdAt, "true"]]);
    return Response.json({ created: true, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await init();
    const body = await request.json() as { action: string; notifId: string; role?: string };

    if (body.action === "done") {
      await writeRows(DONE_SHEET, [[body.notifId, body.role ?? "", new Date().toISOString()]]);
      return Response.json({ marked: true });
    }

    if (body.action === "reset") {
      const rows = await readSheet(DONE_SHEET);
      const filtered = [rows[0], ...rows.slice(1).filter((r) => r[0] !== body.notifId)].filter(Boolean);
      await clearAndWrite(DONE_SHEET, filtered as string[][]);
      return Response.json({ reset: true });
    }

    if (body.action === "deactivate") {
      const rows = await readSheet(NOTIF_SHEET);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === body.notifId) { rows[i][4] = "false"; break; }
      }
      await clearAndWrite(NOTIF_SHEET, rows);
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
    await init();
    const body = await request.json() as { notifId: string };

    const rows = await readSheet(NOTIF_SHEET);
    const filtered = [rows[0], ...rows.slice(1).filter((r) => r[0] !== body.notifId)].filter(Boolean);
    await clearAndWrite(NOTIF_SHEET, filtered as string[][]);

    const doneRows = await readSheet(DONE_SHEET);
    const filteredDone = [doneRows[0], ...doneRows.slice(1).filter((r) => r[0] !== body.notifId)].filter(Boolean);
    await clearAndWrite(DONE_SHEET, filteredDone as string[][]);

    return Response.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
