import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    designation: (r.designation as string) ?? "",
    phone: (r.phone as string) ?? "",
    ptcl: (r.ptcl as string) ?? "",
    email: (r.email as string) ?? "",
    bankBranch: (r.bank_branch as string) ?? "",
    notes: (r.notes as string) ?? "",
  };
}

function toDb(c: Record<string, string>) {
  return {
    id: c.id ?? "",
    name: c.name ?? "",
    designation: c.designation ?? "",
    phone: c.phone ?? "",
    ptcl: c.ptcl ?? "",
    email: c.email ?? "",
    bank_branch: c.bankBranch ?? "",
    notes: c.notes ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("bank_contacts").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ contacts: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; contact?: Record<string, string>; id?: string; contacts?: Record<string, string>[] };

    if (body.action === "upsert" && body.contact) {
      const { error } = await supabase
        .from("bank_contacts")
        .upsert(toDb(body.contact), { onConflict: "id" });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("bank_contacts")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    if (body.contacts) {
      const dbRows = body.contacts.filter((c) => c.id).map(toDb);
      if (dbRows.length > 0) {
        const { error } = await supabase
          .from("bank_contacts")
          .upsert(dbRows, { onConflict: "id" });
        if (error) throw new Error(error.message);
      }
      return Response.json({ saved: true, merged: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
