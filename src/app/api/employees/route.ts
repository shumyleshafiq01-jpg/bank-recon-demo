import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    name: (r.name as string) ?? "",
    designation: (r.designation as string) ?? "",
    phone: (r.phone as string) ?? "",
    bank: (r.bank as string) ?? "",
    acTitle: (r.ac_title as string) ?? "",
    acNo: (r.ac_no as string) ?? "",
    branchCode: (r.branch_code as string) ?? "",
    notes: (r.notes as string) ?? "",
  };
}

function toDb(e: Record<string, string>) {
  return {
    id: e.id ?? "",
    name: e.name ?? "",
    designation: e.designation ?? "",
    phone: e.phone ?? "",
    bank: e.bank ?? "",
    ac_title: e.acTitle ?? "",
    ac_no: e.acNo ?? "",
    branch_code: e.branchCode ?? "",
    notes: e.notes ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("emp_bank_details").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ employees: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; employee?: Record<string, string>; id?: string; employees?: Record<string, string>[] };

    if (body.action === "upsert" && body.employee) {
      const { error } = await supabase
        .from("emp_bank_details")
        .upsert(toDb(body.employee), { onConflict: "id" });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("emp_bank_details")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    if (body.employees) {
      const dbRows = body.employees.filter((e) => e.id).map(toDb);
      if (dbRows.length > 0) {
        const { error } = await supabase
          .from("emp_bank_details")
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
