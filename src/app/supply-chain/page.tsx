"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Package, Calculator, ClipboardList, ShoppingCart, Truck,
  PackageCheck, Ship, ArrowRight, ChevronLeft, LogOut,
  User, Warehouse, FileSpreadsheet, BarChart3,
} from "lucide-react";

type StaffSession = {
  id: string; username: string; displayName: string;
  role: "super_admin" | "admin" | "staff"; mustChangePin: boolean;
};

type Node = { x: number; y: number; vx: number; vy: number; radius: number };

function NeuronBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number>(0);
  const init = useCallback((w: number, h: number) => {
    const count = Math.floor((w * h) / 18000);
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, radius: Math.random() * 2 + 1.5 });
    nodesRef.current = nodes;
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (nodesRef.current.length === 0) init(canvas.width, canvas.height); };
    resize(); window.addEventListener("resize", resize);
    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouse);
    const draw = () => {
      const w = canvas.width; const h = canvas.height; ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current; const mouse = mouseRef.current;
      for (const n of nodes) { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy); if (dist < 180) { n.vx += dx * 0.00008; n.vy += dy * 0.00008; } }
      for (let i = 0; i < nodes.length; i++) { for (let j = i + 1; j < nodes.length; j++) { const dx = nodes[i].x - nodes[j].x; const dy = nodes[i].y - nodes[j].y; const dist = Math.sqrt(dx * dx + dy * dy); if (dist < 140) { ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.strokeStyle = `rgba(16,185,129,${(1 - dist / 140) * 0.18})`; ctx.lineWidth = 0.8; ctx.stroke(); } } }
      for (const n of nodes) { const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy); ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2); ctx.fillStyle = dist < 200 ? `rgba(16,185,129,${0.5 + (1 - dist / 200) * 0.5})` : "rgba(16,185,129,0.35)"; ctx.fill(); }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); window.removeEventListener("mousemove", onMouse); };
  }, [init]);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

const MODULES = [
  { key: "cbm-calculator", route: "/supply-chain/cbm", title: "CBM Calculator", desc: "Container packing calculator — carton dimensions, fill %, AI-suggested loading", icon: Calculator, color: "emerald", iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400", tagBg: "bg-emerald-500/10 text-emerald-300", border: "hover:border-emerald-400/60", tags: ["CBM", "Packing Plans"], active: true },
  { key: "product-master", route: "/supply-chain/products", title: "Product Master", desc: "Carton specifications — dimensions, weight, container capacity per product", icon: Package, color: "teal", iconBg: "bg-teal-500/20", iconColor: "text-teal-400", tagBg: "bg-teal-500/10 text-teal-300", border: "hover:border-teal-400/60", tags: ["Cartons", "Dimensions"], active: true },
  { key: "queries", route: null, title: "Query Management", desc: "Buyer inquiries, PO tracking, quotation requests — query-to-order pipeline", icon: ClipboardList, color: "blue", iconBg: "bg-blue-500/20", iconColor: "text-blue-400", tagBg: "bg-blue-500/10 text-blue-300", border: "hover:border-blue-400/60", tags: ["Queries", "Pipeline"], active: false },
  { key: "bom", route: "/supply-chain/bom", title: "Bill of Materials", desc: "Auto-generate BOM from a CBM plan — required cartons, in-stock, to-order, status", icon: FileSpreadsheet, color: "violet", iconBg: "bg-violet-500/20", iconColor: "text-violet-400", tagBg: "bg-violet-500/10 text-violet-300", border: "hover:border-violet-400/60", tags: ["BOM", "Auto-Generate"], active: true },
  { key: "purchase-orders", route: null, title: "Purchase Orders", desc: "Internal PO to vendors — auto-send via WhatsApp, track order status", icon: ShoppingCart, color: "orange", iconBg: "bg-orange-500/20", iconColor: "text-orange-400", tagBg: "bg-orange-500/10 text-orange-300", border: "hover:border-orange-400/60", tags: ["PO", "WhatsApp"], active: false },
  { key: "grn", route: null, title: "Goods Received", desc: "GRN against PO — quantity verification, damage reporting, auto-update inventory", icon: PackageCheck, color: "cyan", iconBg: "bg-cyan-500/20", iconColor: "text-cyan-400", tagBg: "bg-cyan-500/10 text-cyan-300", border: "hover:border-cyan-400/60", tags: ["GRN", "Verification"], active: false },
  { key: "inventory", route: null, title: "Inventory", desc: "Warehouse stock levels — real-time tracking, reorder alerts, batch management", icon: Warehouse, color: "amber", iconBg: "bg-amber-500/20", iconColor: "text-amber-400", tagBg: "bg-amber-500/10 text-amber-300", border: "hover:border-amber-400/60", tags: ["Stock", "Warehouse"], active: false },
  { key: "packing", route: null, title: "Packing & Loading", desc: "Container packing execution — checklist, photo verification, loading sequence", icon: Truck, color: "rose", iconBg: "bg-rose-500/20", iconColor: "text-rose-400", tagBg: "bg-rose-500/10 text-rose-300", border: "hover:border-rose-400/60", tags: ["Packing", "Loading"], active: false },
  { key: "shipment", route: null, title: "Shipment Tracking", desc: "Container shipment lifecycle — booking, BL, tracking, delivery confirmation", icon: Ship, color: "indigo", iconBg: "bg-indigo-500/20", iconColor: "text-indigo-400", tagBg: "bg-indigo-500/10 text-indigo-300", border: "hover:border-indigo-400/60", tags: ["Shipping", "BL"], active: false },
  { key: "analytics", route: null, title: "SC Analytics", desc: "Supply chain dashboards — lead times, vendor performance, cost trends", icon: BarChart3, color: "pink", iconBg: "bg-pink-500/20", iconColor: "text-pink-400", tagBg: "bg-pink-500/10 text-pink-300", border: "hover:border-pink-400/60", tags: ["Analytics", "KPIs"], active: false },
];

export default function SupplyChainPage() {
  const router = useRouter();
  const [user, setUser] = useState<StaffSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then(d => {
      if (!d.user || d.user.mustChangePin) { router.replace("/login"); return; }
      setUser(d.user); setChecked(true);
    }).catch(() => router.replace("/login"));
  }, [router]);

  if (!checked) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#0c1220" }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#0c1220" }}>
      <NeuronBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Hub
            </button>
            <div className="w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">AI Supply Chain Agent</h1>
                <p className="text-xs text-gray-500">Query &rarr; CBM &rarr; BOM &rarr; PO &rarr; GRN &rarr; Pack &rarr; Ship</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <User className="w-4 h-4" />
                <span>{user.displayName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-medium">{user.role.replace("_", " ")}</span>
              </div>
            )}
            <button onClick={() => { fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).then(() => router.replace("/login")); }} className="p-2 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => mod.active && mod.route && router.push(mod.route)}
                disabled={!mod.active}
                className={`text-left p-5 rounded-2xl border transition-all ${
                  mod.active
                    ? `bg-white/[0.03] border-white/[0.08] ${mod.border} hover:bg-white/[0.06] cursor-pointer group`
                    : "bg-white/[0.015] border-white/[0.04] opacity-50 cursor-default"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl ${mod.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${mod.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold ${mod.active ? "text-white group-hover:text-emerald-300" : "text-gray-500"} transition-colors`}>{mod.title}</h3>
                      {!mod.active && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">TBA</span>}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{mod.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mod.tags.map(t => (
                        <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${mod.tagBg}`}>{t}</span>
                      ))}
                    </div>
                  </div>
                  {mod.active && <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-emerald-400 transition-colors shrink-0 mt-1" />}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-600 mt-8">Kafi Commodities (Pvt) Ltd &middot; Supply Chain Management</p>
      </div>
    </div>
  );
}
