import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    vendorName: (r.vendor_name as string) ?? "",
    contactPerson: (r.contact_person as string) ?? "",
    commodity: (r.commodity as string) ?? "",
    phone: (r.phone as string) ?? "",
    bank: (r.bank as string) ?? "",
    acTitle: (r.ac_title as string) ?? "",
    acNo: (r.ac_no as string) ?? "",
    branchCode: (r.branch_code as string) ?? "",
    notes: (r.notes as string) ?? "",
  };
}

function toDb(v: Record<string, string>) {
  return {
    id: v.id ?? "",
    vendor_name: v.vendorName ?? "",
    contact_person: v.contactPerson ?? "",
    commodity: v.commodity ?? "",
    phone: v.phone ?? "",
    bank: v.bank ?? "",
    ac_title: v.acTitle ?? "",
    ac_no: v.acNo ?? "",
    branch_code: v.branchCode ?? "",
    notes: v.notes ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("vb_vendors").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ vendors: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; vendor?: Record<string, string>; id?: string; vendors?: Record<string, string>[] };

    if (body.action === "upsert" && body.vendor) {
      const { error } = await supabase
        .from("vb_vendors")
        .upsert(toDb(body.vendor), { onConflict: "id" });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("vb_vendors")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    // Legacy whole-array path — merge only, never clear.
    if (body.vendors) {
      const dbRows = body.vendors.filter((v) => v.id).map(toDb);
      if (dbRows.length > 0) {
        const { error } = await supabase
          .from("vb_vendors")
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
