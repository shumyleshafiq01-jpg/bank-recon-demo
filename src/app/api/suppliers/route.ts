import { supabase } from "@/lib/supabase";

function toFrontend(r: Record<string, unknown>) {
  return {
    id: (r.id as string) ?? "",
    category: (r.category as string) ?? "",
    companyName: (r.company_name as string) ?? "",
    contactPerson: (r.contact_person as string) ?? "",
    jobTitle: (r.job_title as string) ?? "",
    phone: (r.phone as string) ?? "",
    service: (r.service as string) ?? "",
    address: (r.address as string) ?? "",
    city: (r.city as string) ?? "",
    product: (r.product as string) ?? "",
    visitStatus: (r.visit_status as string) ?? "",
    grading: (r.grading as string) ?? "",
    notes: (r.notes as string) ?? "",
  };
}

function toDb(v: Record<string, string>) {
  return {
    id: v.id ?? "",
    category: v.category ?? "",
    company_name: v.companyName ?? "",
    contact_person: v.contactPerson ?? "",
    job_title: v.jobTitle ?? "",
    phone: v.phone ?? "",
    service: v.service ?? "",
    address: v.address ?? "",
    city: v.city ?? "",
    product: v.product ?? "",
    visit_status: v.visitStatus ?? "",
    grading: v.grading ?? "",
    notes: v.notes ?? "",
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase.from("sc_suppliers").select("*");
    if (error) throw new Error(error.message);
    return Response.json({ suppliers: (data ?? []).map(toFrontend) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; supplier?: Record<string, string>; id?: string; suppliers?: Record<string, string>[] };

    if (body.action === "upsert" && body.supplier) {
      const { error } = await supabase
        .from("sc_suppliers")
        .upsert(toDb(body.supplier), { onConflict: "id" });
      if (error) throw new Error(error.message);
      return Response.json({ saved: true });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase
        .from("sc_suppliers")
        .delete()
        .eq("id", body.id);
      if (error) throw new Error(error.message);
      return Response.json({ deleted: true });
    }

    if (body.suppliers) {
      const dbRows = body.suppliers.filter((v) => v.id).map(toDb);
      if (dbRows.length > 0) {
        const { error } = await supabase
          .from("sc_suppliers")
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
