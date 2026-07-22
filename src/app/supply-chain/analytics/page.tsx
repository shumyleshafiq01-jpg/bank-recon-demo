"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, BarChart3, ClipboardList, Calculator, FileSpreadsheet, ShoppingCart,
  PackageCheck, Truck, Ship, AlertTriangle, Loader2, Send,
} from "lucide-react";

type StageCount = { total: number; byStatus?: Record<string, number> };

type Analytics = {
  funnel: {
    queries: StageCount; cbmPlans: StageCount; boms: StageCount;
    purchaseOrders: StageCount; grns: StageCount; packing: StageCount; shipments: StageCount;
  };
  vendorSpend: { vendor: string; poCount: number; totalValue: number }[];
  lowStock: { name: string; qtyOnHand: number; reorderLevel: number; unit: string }[];
  notifications: Record<string, number>;
};

const STAGES: { key: keyof Analytics["funnel"]; label: string; icon: typeof ClipboardList; badge: string; bar: string }[] = [
  { key: "queries", label: "Queries", icon: ClipboardList, badge: "text-blue-600 bg-blue-500/10", bar: "bg-blue-500" },
  { key: "cbmPlans", label: "CBM Plans", icon: Calculator, badge: "text-emerald-600 bg-emerald-500/10", bar: "bg-emerald-500" },
  { key: "boms", label: "BOMs", icon: FileSpreadsheet, badge: "text-violet-600 bg-violet-500/10", bar: "bg-violet-500" },
  { key: "purchaseOrders", label: "Purchase Orders", icon: ShoppingCart, badge: "text-orange-600 bg-orange-500/10", bar: "bg-orange-500" },
  { key: "grns", label: "GRNs", icon: PackageCheck, badge: "text-cyan-600 bg-cyan-500/10", bar: "bg-cyan-500" },
  { key: "packing", label: "Packing Sessions", icon: Truck, badge: "text-rose-600 bg-rose-500/10", bar: "bg-rose-500" },
  { key: "shipments", label: "Shipments", icon: Ship, badge: "text-indigo-600 bg-indigo-500/10", bar: "bg-indigo-500" },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/supply-chain/analytics").then(r => r.json()).then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" /></div>;

  const maxTotal = Math.max(1, ...STAGES.map(s => data.funnel[s.key].total));

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push("/supply-chain")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4" /> Supply Chain
          </button>
          <div className="w-px h-5 bg-gray-300" />
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-pink-600" />
            <h1 className="text-lg font-bold text-gray-900">SC Analytics</h1>
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Pipeline Funnel — Query → Shipment</h3>
          <div className="space-y-3">
            {STAGES.map(s => {
              const stage = data.funnel[s.key];
              const Icon = s.icon;
              const pct = Math.max(4, Math.round((stage.total / maxTotal) * 100));
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${s.badge} flex items-center justify-center shrink-0`}><Icon className="w-4 h-4" /></div>
                  <div className="w-32 text-xs text-gray-600 shrink-0">{s.label}</div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden relative">
                    <div className={`h-full rounded-md ${s.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-10 text-right text-sm font-semibold text-gray-900 shrink-0">{stage.total}</div>
                  {stage.byStatus && (
                    <div className="hidden md:flex gap-1 shrink-0">
                      {Object.entries(stage.byStatus).map(([status, count]) => (
                        <span key={status} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{status}: {count}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vendor Spend */}
          <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Vendor Spend</h3>
            {data.vendorSpend.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No PO rate data yet — spend appears once materials are ordered with a rate set.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400">
                    <th className="text-left font-medium py-1.5">Vendor</th>
                    <th className="text-center font-medium py-1.5 w-16">POs</th>
                    <th className="text-right font-medium py-1.5 w-24">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendorSpend.slice(0, 10).map(v => (
                    <tr key={v.vendor} className="border-t border-gray-100">
                      <td className="py-2 text-gray-900 text-xs font-medium">{v.vendor}</td>
                      <td className="py-2 text-center text-gray-500 text-xs">{v.poCount}</td>
                      <td className="py-2 text-right text-gray-900 text-xs font-semibold">${v.totalValue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Low Stock */}
          <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Low Stock Alerts
            </h3>
            {data.lowStock.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Nothing at or below its reorder level right now.</p>
            ) : (
              <div className="space-y-2">
                {data.lowStock.map(i => (
                  <div key={i.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
                    <span className="text-xs text-gray-900 font-medium">{i.name}</span>
                    <span className="text-xs text-amber-700">{i.qtyOnHand} / {i.reorderLevel} {i.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notification Outbox Health */}
        <div className="rounded-xl bg-white/70 border border-gray-200/80 p-5 mt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><Send className="w-4 h-4 text-emerald-600" /> Notification Outbox</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-gray-500">Sent: <span className="text-emerald-600 font-semibold">{data.notifications.sent || 0}</span></span>
            <span className="text-gray-500">Pending (not configured): <span className="text-amber-600 font-semibold">{data.notifications.pending || 0}</span></span>
            <span className="text-gray-500">Failed: <span className="text-red-600 font-semibold">{data.notifications.failed || 0}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
