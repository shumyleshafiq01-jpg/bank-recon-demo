"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, ShoppingCart, Plus, Trash2, X, Loader2, Check,
  Package, ChevronDown, Send, PackageCheck, FileText, Store,
} from "lucide-react";

type Bom = {
  id: string; bom_name: string; buyer_name: string; container_type: string;
};
type BomItem = {
  id: string; product_id: string | null; product_name: string; packing_desc: string;
  cartons_required: number; in_stock: number; to_order: number;
};
type Vendor = { id: string; vendorName: string; commodity: string; phone: string };

type PoItem = {
  id: string; product_name: string; packing_desc: string; cartons_ordered: number; remarks: string;
};
type Po = {
  id: string; po_number: string; vendor_name: string; vendor_phone: string;
  status: string; total_cartons: number; notes: string; bom_id: string | null; items: PoItem[];
};

// A to-order line the user assigns a vendor to
type AssignRow = {
  productId: string | null; productName: string; packingDesc: string;
  cartons: number; vendorId: string;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-200/70 text-gray-500" },
  sent: { label: "Sent", color: "bg-blue-500/10 text-blue-600" },
  received: { label: "Received", color: "bg-emerald-500/10 text-emerald-600" },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600" },
};

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [pos, setPos] = useState<Po[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Generate flow
  const [showGenerate, setShowGenerate] = useState(false);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [selectedBom, setSelectedBom] = useState<Bom | null>(null);
  const [assignRows, setAssignRows] = useState<AssignRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadPos() {
    const r = await fetch("/api/supply-chain/purchase-orders");
    const d = await r.json();
    setPos(d.pos ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadPos();
    fetch("/api/vendors").then(r => r.json()).then(d => setVendors(d.vendors ?? [])).catch(() => {});
  }, []);

  async function openGenerate() {
    setShowGenerate(true);
    setSelectedBom(null);
    setAssignRows([]);
    const r = await fetch("/api/supply-chain/boms");
    const d = await r.json();
    setBoms(d.boms ?? []);
  }

  async function pickBom(bom: Bom) {
    setSelectedBom(bom);
    setLoadingItems(true);
    const r = await fetch(`/api/supply-chain/boms?id=${bom.id}`);
    const d = await r.json();
    const items: BomItem[] = d.items ?? [];
    // Only items that need ordering
    const rows: AssignRow[] = items
      .filter(it => it.to_order > 0)
      .map(it => ({
        productId: it.product_id, productName: it.product_name, packingDesc: it.packing_desc,
        cartons: it.to_order, vendorId: "",
      }));
    setAssignRows(rows);
    setLoadingItems(false);
  }

  function setRowVendor(idx: number, vendorId: string) {
    setAssignRows(prev => { const n = [...prev]; n[idx] = { ...n[idx], vendorId }; return n; });
  }

  // Apply one vendor to all unassigned rows
  function assignAllTo(vendorId: string) {
    if (!vendorId) return;
    setAssignRows(prev => prev.map(r => r.vendorId ? r : { ...r, vendorId }));
  }

  const assignedCount = useMemo(() => assignRows.filter(r => r.vendorId).length, [assignRows]);
  const vendorGroups = useMemo(() => {
    const g = new Set(assignRows.filter(r => r.vendorId).map(r => r.vendorId));
    return g.size;
  }, [assignRows]);

  async function generatePos() {
    if (!selectedBom || assignedCount === 0) return;
    setGenerating(true);
    const assignments = assignRows
      .filter(r => r.vendorId && r.cartons > 0)
      .map(r => {
        const v = vendors.find(x => x.id === r.vendorId);
        return {
          productId: r.productId, productName: r.productName, packingDesc: r.packingDesc,
          cartons: r.cartons, vendorId: r.vendorId,
          vendorName: v?.vendorName || "Unknown", vendorPhone: v?.phone || "",
        };
      });
    await fetch("/api/supply-chain/purchase-orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", bomId: selectedBom.id, assignments }),
    });
    setGenerating(false);
    setShowGenerate(false);
    loadPos();
  }

  async function setStatus(id: string, status: string) {
    await fetch("/api/supply-chain/purchase-orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, status }),
    });
    setPos(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  }

  async function deletePo(id: string) {
    await fetch("/api/supply-chain/purchase-orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setPos(prev => prev.filter(p => p.id !== id));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Supply Chain
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Purchase Orders</h1>
              <span className="text-xs text-gray-400">{pos.length}</span>
            </div>
          </div>
          <button onClick={openGenerate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Generate from BOM
          </button>
        </div>

        {pos.length === 0 ? (
          <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No purchase orders yet</p>
            <p className="text-gray-400 text-xs mb-4">Generate POs from a BOM&apos;s to-order items — one PO per vendor.</p>
            <button onClick={openGenerate} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> Generate from BOM
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pos.map(po => {
              const meta = STATUS_META[po.status] || STATUS_META.draft;
              return (
                <div key={po.id} className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200/70">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Store className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-semibold text-sm">{po.vendor_name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${meta.color}`}>{meta.label}</span>
                        </div>
                        <div className="text-xs text-gray-500">{po.po_number} · {po.total_cartons} cartons{po.vendor_phone && ` · ${po.vendor_phone}`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {po.status === "draft" && (
                        <button onClick={() => setStatus(po.id, "sent")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors cursor-pointer" title="Mark as sent (WhatsApp auto-send is Phase 2)">
                          <Send className="w-3.5 h-3.5" /> Mark Sent
                        </button>
                      )}
                      {po.status === "sent" && (
                        <button onClick={() => setStatus(po.id, "received")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                          <PackageCheck className="w-3.5 h-3.5" /> Mark Received
                        </button>
                      )}
                      <button onClick={() => deletePo(po.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {po.items.map((it, i) => (
                        <tr key={it.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2 text-gray-400 text-xs w-8">{i + 1}</td>
                          <td className="px-4 py-2 text-gray-900 text-xs font-medium">{it.product_name}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{it.packing_desc}</td>
                          <td className="px-4 py-2 text-right text-orange-600 text-xs font-medium w-24">{it.cartons_ordered} ctn</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowGenerate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">Generate Purchase Orders</h3>
                <p className="text-xs text-gray-500 mt-0.5">{!selectedBom ? "Pick a BOM to pull its to-order items" : "Assign a vendor to each item — one PO is created per vendor"}</p>
              </div>
              <button onClick={() => setShowGenerate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            {!selectedBom ? (
              <div className="flex-1 overflow-y-auto">
                {boms.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No BOMs yet. Create one in the BOM module first.</div>}
                {boms.map(b => (
                  <button key={b.id} onClick={() => pickBom(b)} className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-violet-600" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900 text-sm font-medium truncate">{b.bom_name}</div>
                      <div className="text-xs text-gray-500 truncate">{b.buyer_name && `${b.buyer_name} · `}{b.container_type.toUpperCase()}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-gray-200/70 flex items-center justify-between gap-3">
                  <button onClick={() => { setSelectedBom(null); setAssignRows([]); }} className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /> Back to BOMs</button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Assign all to:</span>
                    <div className="relative">
                      <select onChange={e => { assignAllTo(e.target.value); e.target.value = ""; }} defaultValue=""
                        className="bg-white border border-gray-200 rounded-lg pl-2 pr-7 py-1 text-xs text-gray-900 appearance-none focus:outline-none cursor-pointer max-w-[180px]">
                        <option value="" className="bg-white">Pick vendor…</option>
                        {vendors.map(v => <option key={v.id} value={v.id} className="bg-white">{v.vendorName}</option>)}
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loadingItems && <div className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-orange-600 mx-auto" /></div>}
                  {!loadingItems && assignRows.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">This BOM has nothing to order (everything is in stock).</div>}
                  {assignRows.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200/70 sticky top-0 bg-white">
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs">Product</th>
                          <th className="text-center px-4 py-2 text-gray-500 font-medium text-xs w-20">To Order</th>
                          <th className="text-left px-4 py-2 text-gray-500 font-medium text-xs w-56">Vendor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="px-4 py-2">
                              <div className="text-gray-900 text-xs font-medium">{row.productName}</div>
                              <div className="text-gray-400 text-[11px]">{row.packingDesc}</div>
                            </td>
                            <td className="px-4 py-2 text-center text-orange-600 text-xs font-medium">{row.cartons}</td>
                            <td className="px-4 py-2">
                              <div className="relative">
                                <select value={row.vendorId} onChange={e => setRowVendor(idx, e.target.value)}
                                  className={`w-full border rounded-lg pl-2 pr-7 py-1 text-xs appearance-none focus:outline-none cursor-pointer ${row.vendorId ? "bg-white border-gray-200 text-gray-900" : "bg-amber-500/[0.06] border-amber-500/20 text-amber-700"}`}>
                                  <option value="" className="bg-white">Unassigned</option>
                                  {vendors.map(v => <option key={v.id} value={v.id} className="bg-white">{v.vendorName}{v.commodity ? ` — ${v.commodity}` : ""}</option>)}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200/70">
                  <span className="text-xs text-gray-500">{assignedCount} of {assignRows.length} assigned · {vendorGroups} PO{vendorGroups !== 1 ? "s" : ""} will be created</span>
                  <button onClick={generatePos} disabled={generating || assignedCount === 0} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create {vendorGroups > 0 ? vendorGroups : ""} PO{vendorGroups !== 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
