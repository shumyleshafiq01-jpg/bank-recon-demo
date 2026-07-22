"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Ship, Plus, Trash2, X, Loader2, Check, Package,
} from "lucide-react";

type PackingSession = {
  id: string; session_number: string; buyer_name: string; container_type: string; status: string;
};

type Shipment = {
  id: string; shipment_number: string; buyer_name: string | null; container_type: string;
  carrier: string | null; vessel_name: string | null; booking_number: string | null;
  bl_number: string | null; bl_date: string | null; port_of_loading: string | null; port_of_discharge: string | null;
  etd: string | null; eta: string | null; actual_delivery_date: string | null;
  status: "booked" | "in_transit" | "arrived" | "delivered"; notes: string | null;
};

const STATUS_FLOW: { value: Shipment["status"]; label: string; color: string }[] = [
  { value: "booked", label: "Booked", color: "bg-gray-200/70 text-gray-500" },
  { value: "in_transit", label: "In Transit", color: "bg-blue-500/10 text-blue-600" },
  { value: "arrived", label: "Arrived", color: "bg-amber-500/10 text-amber-600" },
  { value: "delivered", label: "Delivered", color: "bg-emerald-500/10 text-emerald-600" },
];

const FIELD_DEFS: { key: keyof Shipment; label: string; type: string }[] = [
  { key: "carrier", label: "Carrier", type: "text" },
  { key: "vessel_name", label: "Vessel Name", type: "text" },
  { key: "booking_number", label: "Booking Number", type: "text" },
  { key: "bl_number", label: "B/L Number", type: "text" },
  { key: "bl_date", label: "B/L Date", type: "date" },
  { key: "port_of_loading", label: "Port of Loading", type: "text" },
  { key: "port_of_discharge", label: "Port of Discharge", type: "text" },
  { key: "etd", label: "ETD", type: "date" },
  { key: "eta", label: "ETA", type: "date" },
];

export default function ShipmentPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Shipment | null>(null);
  const [form, setForm] = useState<Partial<Shipment>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [sessions, setSessions] = useState<PackingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function loadShipments() {
    const r = await fetch("/api/supply-chain/shipments");
    const d = await r.json();
    setShipments(d.shipments ?? []);
    setLoading(false);
  }

  useEffect(() => { loadShipments(); }, []);

  async function openCreate() {
    setShowCreate(true);
    setSessionsLoading(true);
    const r = await fetch("/api/supply-chain/packing");
    const d = await r.json();
    setSessions((d.sessions ?? []).filter((s: PackingSession) => s.status === "completed"));
    setSessionsLoading(false);
  }

  async function createFromSession(session: PackingSession) {
    setCreatingId(session.id);
    const r = await fetch("/api/supply-chain/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-from-packing", packingSessionId: session.id }),
    });
    const d = await r.json();
    setCreatingId(null);
    setShowCreate(false);
    if (d.id) {
      await loadShipments();
      openShipment(d.id);
    }
  }

  async function openShipment(id: string) {
    const r = await fetch(`/api/supply-chain/shipments?id=${id}`);
    const d = await r.json();
    setActive(d.shipment ?? null);
    setForm(d.shipment ?? {});
    setSaved(true);
  }

  function updateForm(key: keyof Shipment, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    const r = await fetch("/api/supply-chain/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update", id: active.id,
        carrier: form.carrier, vesselName: form.vessel_name, bookingNumber: form.booking_number,
        blNumber: form.bl_number, blDate: form.bl_date, portOfLoading: form.port_of_loading,
        portOfDischarge: form.port_of_discharge, etd: form.etd, eta: form.eta, notes: form.notes,
      }),
    });
    await r.json();
    setSaving(false);
    setSaved(true);
    openShipment(active.id);
    loadShipments();
  }

  async function setStatus(status: Shipment["status"]) {
    if (!active) return;
    const body: Record<string, unknown> = { action: "update", id: active.id, status };
    if (status === "delivered") body.actualDeliveryDate = new Date().toISOString().slice(0, 10);
    await fetch("/api/supply-chain/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    openShipment(active.id);
    loadShipments();
  }

  async function deleteShipment(id: string) {
    await fetch("/api/supply-chain/shipments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setShipments(prev => prev.filter(s => s.id !== id));
    if (active?.id === id) { setActive(null); setForm({}); }
  }

  const statusIdx = (s: string) => STATUS_FLOW.findIndex(x => x.value === s);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-indigo-600" />
              <h1 className="text-lg font-bold text-gray-900">Shipment Tracking</h1>
              <span className="text-xs text-gray-400">{shipments.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {shipments.length > 0 && (
              <button onClick={() => setActive(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                All Shipments
              </button>
            )}
            <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Shipment from Packing
            </button>
          </div>
        </div>

        {!active ? (
          shipments.length === 0 ? (
            <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
              <Ship className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-1">No shipments tracked yet</p>
              <p className="text-gray-400 text-xs mb-4">Start one once a packing session is complete.</p>
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" /> New Shipment from Packing
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {shipments.map(s => {
                const meta = STATUS_FLOW[statusIdx(s.status)] ?? STATUS_FLOW[0];
                return (
                  <div key={s.id} className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <button onClick={() => openShipment(s.id)} className="flex-1 text-left cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-semibold text-sm">{s.shipment_number}</span>
                          {s.buyer_name && <span className="text-gray-500 text-sm">— {s.buyer_name}</span>}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${meta.color}`}>{meta.label}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {s.container_type.toUpperCase()}
                          {s.booking_number && ` · Booking ${s.booking_number}`}
                          {s.eta && ` · ETA ${s.eta}`}
                        </div>
                      </button>
                      <button onClick={() => deleteShipment(s.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
              <div>
                <h2 className="text-gray-900 font-semibold">{active.shipment_number}</h2>
                <p className="text-xs text-gray-500">{active.buyer_name && `${active.buyer_name} · `}{active.container_type.toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {STATUS_FLOW.map((s, i) => (
                  <button key={s.value} onClick={() => setStatus(s.value)} disabled={i < statusIdx(active.status)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${active.status === s.value ? s.color : i < statusIdx(active.status) ? "bg-gray-100 text-gray-400" : "text-gray-400 hover:bg-gray-100"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {FIELD_DEFS.map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                    <input type={f.type} value={(form[f.key] as string) || ""} onChange={e => updateForm(f.key, e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-indigo-500/50" />
                  </div>
                ))}
              </div>
              {active.actual_delivery_date && (
                <p className="text-xs text-emerald-700 mt-3 flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Delivered on {active.actual_delivery_date}</p>
              )}
            </div>

            <div className="rounded-xl bg-white/70 border border-gray-200/80 p-4">
              <label className="text-xs text-gray-500 mb-1.5 block">Notes</label>
              <textarea value={form.notes || ""} onChange={e => updateForm("notes", e.target.value)} rows={3}
                placeholder="e.g. customs hold at port, transshipment via..."
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-4 focus:outline-none focus:border-indigo-500/50" />
              <div className="flex items-center justify-between">
                {saved && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3.5 h-3.5" /> Saved</span>}
                <button onClick={save} disabled={saving} className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">New Shipment</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pick a completed packing session</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sessionsLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-600 mx-auto" /></div>}
              {!sessionsLoading && sessions.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No completed packing sessions yet.</div>}
              {sessions.map(s => (
                <button key={s.id} onClick={() => createFromSession(s)} disabled={creatingId === s.id}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-rose-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 text-sm font-medium truncate">{s.session_number}</div>
                    <div className="text-xs text-gray-500 truncate">{s.buyer_name && `${s.buyer_name} · `}{s.container_type.toUpperCase()}</div>
                  </div>
                  {creatingId === s.id && <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
