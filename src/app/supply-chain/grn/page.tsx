"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, PackageCheck, Plus, Trash2, X, Loader2, Check,
  Store, ChevronDown, ChevronUp, ShieldCheck, MessageCircle, Mail,
} from "lucide-react";

type PoItem = { id: string; product_name: string; packing_desc: string; cartons_ordered: number };
type Po = {
  id: string; po_number: string; vendor_name: string; status: string;
  total_cartons: number; items: PoItem[];
};

type GrnItem = {
  id: string; product_name: string; packing_desc: string;
  cartons_ordered: number; cartons_received: number; damaged: number; remarks: string;
};
type Grn = {
  id: string; grn_number: string; po_number: string | null; vendor_name: string | null;
  status: "awaiting" | "approved"; notes: string; approved_at: string | null; items: GrnItem[];
};

type NotifyResult = { channel: string; recipient: string; status: string; error?: string };

export default function GrnPage() {
  const router = useRouter();
  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { received: number; damaged: number; remarks: string }>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [lastNotify, setLastNotify] = useState<NotifyResult[] | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [sentPos, setSentPos] = useState<Po[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/supply-chain/grns");
    const d = await r.json();
    setGrns(d.grns ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openGrn(grn: Grn) {
    if (expanded === grn.id) { setExpanded(null); return; }
    setExpanded(grn.id);
    const map: Record<string, { received: number; damaged: number; remarks: string }> = {};
    for (const it of grn.items) map[it.id] = { received: it.cartons_received, damaged: it.damaged, remarks: it.remarks || "" };
    setEdits(map);
  }

  async function openCreate() {
    setShowCreate(true);
    setPosLoading(true);
    const r = await fetch("/api/supply-chain/purchase-orders");
    const d = await r.json();
    setSentPos(((d.pos ?? []) as Po[]).filter(p => p.status === "sent"));
    setPosLoading(false);
  }

  async function createFromPo(po: Po) {
    setCreatingId(po.id);
    const r = await fetch("/api/supply-chain/grns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-from-po", poId: po.id }),
    });
    const d = await r.json();
    setCreatingId(null);
    setShowCreate(false);
    if (d.notified) setLastNotify(d.notified);
    load();
  }

  async function approve(grn: Grn) {
    setApproving(grn.id);
    const items = grn.items.map(it => ({
      id: it.id,
      cartonsReceived: edits[it.id]?.received ?? it.cartons_received,
      damaged: edits[it.id]?.damaged ?? it.damaged,
      remarks: edits[it.id]?.remarks ?? it.remarks,
    }));
    const r = await fetch("/api/supply-chain/grns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", id: grn.id, items }),
    });
    const d = await r.json();
    setApproving(null);
    if (d.notified) setLastNotify(d.notified);
    setExpanded(null);
    load();
  }

  async function remove(id: string) {
    await fetch("/api/supply-chain/grns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setGrns(prev => prev.filter(g => g.id !== id));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-cyan-600" />
              <h1 className="text-lg font-bold text-gray-900">Goods Received</h1>
              <span className="text-xs text-gray-400">{grns.length}</span>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Goods Arrived (from PO)
          </button>
        </div>

        {/* Notification result banner */}
        {lastNotify && lastNotify.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg bg-white/70 border border-gray-200/80 text-xs">
            <span className="text-gray-500 font-medium">Notifications:</span>
            {lastNotify.map((n, i) => (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${n.status === "sent" ? "bg-emerald-500/10 text-emerald-700" : n.status === "pending" ? "bg-amber-500/10 text-amber-700" : "bg-red-500/10 text-red-600"}`}>
                {n.channel === "whatsapp" ? <MessageCircle className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                {n.recipient}: {n.status}{n.status === "pending" ? " (keys not configured)" : ""}
              </span>
            ))}
            <button onClick={() => setLastNotify(null)} className="ml-auto p-0.5 rounded hover:bg-gray-100 text-gray-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {grns.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <PackageCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No GRNs yet</p>
            <p className="text-gray-400 text-xs mb-4">When goods arrive against a sent PO, create a GRN — the receiver verifies quantities and approves.</p>
            <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Goods Arrived (from PO)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {grns.map(grn => {
              const open = expanded === grn.id;
              const awaiting = grn.status === "awaiting";
              return (
                <div key={grn.id} className={`rounded-xl bg-white/70 border overflow-hidden ${awaiting ? "border-amber-300/60" : "border-gray-200/80"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/80" onClick={() => openGrn(grn)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${awaiting ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                        {awaiting ? <PackageCheck className="w-4 h-4 text-amber-600" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-semibold text-sm">{grn.grn_number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${awaiting ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                            {awaiting ? "Awaiting Approval" : "Approved"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                          {grn.po_number && <span>PO {grn.po_number}</span>}
                          {grn.vendor_name && <><span>·</span><Store className="w-3 h-3" /><span>{grn.vendor_name}</span></>}
                          {grn.approved_at && <><span>·</span><span>approved {new Date(grn.approved_at).toLocaleDateString()}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {awaiting && (
                        <button onClick={(e) => { e.stopPropagation(); remove(grn.id); }} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-gray-200/70">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200/70">
                            <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Product</th>
                            <th className="text-center px-4 py-2 text-gray-500 font-medium text-xs w-20">Ordered</th>
                            <th className="text-center px-4 py-2 text-gray-500 font-medium text-xs w-24">Received</th>
                            <th className="text-center px-4 py-2 text-gray-500 font-medium text-xs w-24">Damaged</th>
                            <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs w-40">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grn.items.map(it => {
                            const e = edits[it.id] ?? { received: it.cartons_received, damaged: it.damaged, remarks: it.remarks || "" };
                            const short = (awaiting ? e.received : it.cartons_received) < it.cartons_ordered;
                            return (
                              <tr key={it.id} className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2">
                                  <div className="text-gray-900 text-xs font-medium">{it.product_name}</div>
                                  <div className="text-gray-400 text-[11px]">{it.packing_desc}</div>
                                </td>
                                <td className="px-4 py-2 text-center text-gray-700 text-xs font-medium">{it.cartons_ordered}</td>
                                <td className="px-4 py-2 text-center">
                                  {awaiting ? (
                                    <input type="number" min="0" value={e.received}
                                      onClick={ev => ev.stopPropagation()}
                                      onChange={ev => setEdits(prev => ({ ...prev, [it.id]: { ...e, received: Number(ev.target.value) || 0 } }))}
                                      className={`w-20 bg-white border rounded px-2 py-1 text-center text-sm focus:outline-none focus:border-cyan-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${short ? "border-amber-400 text-amber-700" : "border-gray-200 text-gray-900"}`} />
                                  ) : (
                                    <span className={`text-xs font-medium ${short ? "text-amber-700" : "text-emerald-700"}`}>{it.cartons_received}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {awaiting ? (
                                    <input type="number" min="0" value={e.damaged}
                                      onClick={ev => ev.stopPropagation()}
                                      onChange={ev => setEdits(prev => ({ ...prev, [it.id]: { ...e, damaged: Number(ev.target.value) || 0 } }))}
                                      className="w-20 bg-white border border-gray-200 rounded px-2 py-1 text-center text-sm text-gray-900 focus:outline-none focus:border-cyan-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                  ) : (
                                    <span className={`text-xs ${it.damaged > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>{it.damaged || "—"}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  {awaiting ? (
                                    <input type="text" value={e.remarks} placeholder="..."
                                      onClick={ev => ev.stopPropagation()}
                                      onChange={ev => setEdits(prev => ({ ...prev, [it.id]: { ...e, remarks: ev.target.value } }))}
                                      className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 text-xs focus:outline-none focus:border-cyan-500/50" />
                                  ) : (
                                    <span className="text-xs text-gray-500">{it.remarks || "—"}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {awaiting && (
                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200/70">
                          <span className="text-xs text-gray-400 mr-auto">Verify quantities, then approve — stock updates automatically</span>
                          <button onClick={() => approve(grn)} disabled={approving === grn.id}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                            {approving === grn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            Approve — Goods Received
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">Goods Arrived</h3>
                <p className="text-xs text-gray-500 mt-0.5">Pick the sent PO these goods arrived against — the receiver will be notified</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {posLoading && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-cyan-600 mx-auto" /></div>}
              {!posLoading && sentPos.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No POs with status &quot;Sent&quot;. Mark a PO as sent first.</div>}
              {sentPos.map(po => (
                <button key={po.id} onClick={() => createFromPo(po)} disabled={creatingId === po.id}
                  className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0"><Store className="w-4 h-4 text-orange-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 text-sm font-medium truncate">{po.po_number} — {po.vendor_name}</div>
                    <div className="text-xs text-gray-500 truncate">{po.total_cartons} cartons · {po.items.length} item{po.items.length !== 1 ? "s" : ""}</div>
                  </div>
                  {creatingId === po.id && <Loader2 className="w-4 h-4 animate-spin text-cyan-600 shrink-0" />}
                  {creatingId !== po.id && <Check className="w-4 h-4 text-transparent shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
