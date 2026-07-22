import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notifyEvent } from "@/lib/sc-notify";

function shipmentNumber(seq: number): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `SHP-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data, error } = await supabase.from("sc_shipments").select("*").eq("id", id).single();
      if (error) throw error;
      return Response.json({ shipment: data });
    }

    const { data, error } = await supabase.from("sc_shipments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ shipments: data ?? [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Start tracking a shipment from a completed packing session
    if (body.action === "create-from-packing" && body.packingSessionId) {
      const { data: pack, error: pErr } = await supabase.from("sc_packing_sessions").select("*").eq("id", body.packingSessionId).single();
      if (pErr) throw pErr;

      const { count } = await supabase.from("sc_shipments").select("id", { count: "exact", head: true });

      const { data: shipment, error } = await supabase
        .from("sc_shipments")
        .insert({
          shipment_number: shipmentNumber((count ?? 0) + 1),
          packing_session_id: pack.id,
          bom_id: pack.bom_id,
          buyer_name: pack.buyer_name,
          container_type: pack.container_type,
          status: "booked",
          created_by: session.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      return Response.json({ ok: true, id: shipment.id });
    }

    // Direct creation, no packing session linked (rare — e.g. a small ad-hoc shipment)
    if (body.action === "create" && !body.packingSessionId) {
      const { count } = await supabase.from("sc_shipments").select("id", { count: "exact", head: true });
      const { data: shipment, error } = await supabase
        .from("sc_shipments")
        .insert({
          shipment_number: shipmentNumber((count ?? 0) + 1),
          buyer_name: body.buyerName || null,
          container_type: body.containerType || "20ft",
          status: "booked",
          created_by: session.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, id: shipment.id });
    }

    if (body.action === "update" && body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const fields = ["carrier", "vesselName", "bookingNumber", "blNumber", "blDate", "portOfLoading", "portOfDischarge", "etd", "eta", "actualDeliveryDate", "status", "notes"] as const;
      const map: Record<string, string> = {
        carrier: "carrier", vesselName: "vessel_name", bookingNumber: "booking_number", blNumber: "bl_number",
        blDate: "bl_date", portOfLoading: "port_of_loading", portOfDischarge: "port_of_discharge",
        etd: "etd", eta: "eta", actualDeliveryDate: "actual_delivery_date", status: "status", notes: "notes",
      };
      for (const f of fields) {
        if (body[f] !== undefined) updates[map[f]] = body[f] || null;
      }

      const { data: before } = await supabase.from("sc_shipments").select("*").eq("id", body.id).maybeSingle();
      const { error } = await supabase.from("sc_shipments").update(updates).eq("id", body.id);
      if (error) throw error;

      let notified: unknown[] = [];
      // Fires once, the first time a booking number is actually saved
      if (body.bookingNumber && before && !before.booking_number) {
        notified = await notifyEvent({
          event: "shipment_booked",
          refId: body.id,
          text: `*KAFI — SHIPMENT BOOKED*\n${before.shipment_number}${before.buyer_name ? ` — ${before.buyer_name}` : ""}\nBooking: ${body.bookingNumber} · ${before.container_type.toUpperCase()}.`,
          subject: `Shipment booked — ${before.shipment_number}`,
        });
      }
      if (body.status === "delivered" && before?.status !== "delivered") {
        notified = await notifyEvent({
          event: "shipment_delivered",
          refId: body.id,
          text: `*KAFI — SHIPMENT DELIVERED*\n${before?.shipment_number}${before?.buyer_name ? ` — ${before.buyer_name}` : ""} has been delivered.`,
          subject: `Shipment delivered — ${before?.shipment_number}`,
        });
      }

      return Response.json({ ok: true, notified });
    }

    if (body.action === "delete" && body.id) {
      const { error } = await supabase.from("sc_shipments").delete().eq("id", body.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
