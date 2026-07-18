"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Package, Calculator, ClipboardList, ShoppingCart, Truck,
  PackageCheck, Ship, ArrowRight, ChevronLeft, LogOut,
  User, Warehouse, FileSpreadsheet, BarChart3, Plug, X, Loader2, Save,
  Plus, Trash2, Edit3, MessageCircle, Mail, ShieldCheck,
} from "lucide-react";
import { SC_EVENTS } from "@/lib/sc-events";

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
  { key: "cbm-calculator", route: "/supply-chain/cbm", title: "CBM Calculator", desc: "Container packing calculator — carton dimensions, fill %, AI-suggested loading", icon: Calculator, color: "emerald", iconBg: "bg-emerald-500/20", iconColor: "text-emerald-600", tagBg: "bg-emerald-500/10 text-emerald-700", border: "hover:border-emerald-400/60", tags: ["CBM", "Packing Plans"], active: true },
  { key: "product-master", route: "/supply-chain/products", title: "Product Master", desc: "Carton specifications — dimensions, weight, container capacity per product", icon: Package, color: "teal", iconBg: "bg-teal-500/20", iconColor: "text-teal-600", tagBg: "bg-teal-500/10 text-teal-700", border: "hover:border-teal-400/60", tags: ["Cartons", "Dimensions"], active: true },
  { key: "queries", route: null, title: "Query Management", desc: "Buyer inquiries, PO tracking, quotation requests — query-to-order pipeline", icon: ClipboardList, color: "blue", iconBg: "bg-blue-500/20", iconColor: "text-blue-600", tagBg: "bg-blue-500/10 text-blue-700", border: "hover:border-blue-400/60", tags: ["Queries", "Pipeline"], active: false },
  { key: "bom", route: "/supply-chain/bom", title: "Bill of Materials", desc: "Auto-generate BOM from a CBM plan — required cartons, in-stock, to-order, status", icon: FileSpreadsheet, color: "violet", iconBg: "bg-violet-500/20", iconColor: "text-violet-600", tagBg: "bg-violet-500/10 text-violet-700", border: "hover:border-violet-400/60", tags: ["BOM", "Auto-Generate"], active: true },
  { key: "purchase-orders", route: "/supply-chain/purchase-orders", title: "Purchase Orders", desc: "Generate POs from a BOM — one per vendor, track Draft → Sent → Received", icon: ShoppingCart, color: "orange", iconBg: "bg-orange-500/20", iconColor: "text-orange-600", tagBg: "bg-orange-500/10 text-orange-700", border: "hover:border-orange-400/60", tags: ["PO", "Per-Vendor"], active: true },
  { key: "grn", route: "/supply-chain/grn", title: "Goods Received", desc: "GRN against PO — receiver gets WhatsApp/email, verifies quantities & approves", icon: PackageCheck, color: "cyan", iconBg: "bg-cyan-500/20", iconColor: "text-cyan-600", tagBg: "bg-cyan-500/10 text-cyan-700", border: "hover:border-cyan-400/60", tags: ["GRN", "Notify + Approve"], active: true },
  { key: "inventory", route: null, title: "Inventory", desc: "Warehouse stock levels — real-time tracking, reorder alerts, batch management", icon: Warehouse, color: "amber", iconBg: "bg-amber-500/20", iconColor: "text-amber-600", tagBg: "bg-amber-500/10 text-amber-700", border: "hover:border-amber-400/60", tags: ["Stock", "Warehouse"], active: false },
  { key: "packing", route: null, title: "Packing & Loading", desc: "Container packing execution — checklist, photo verification, loading sequence", icon: Truck, color: "rose", iconBg: "bg-rose-500/20", iconColor: "text-rose-600", tagBg: "bg-rose-500/10 text-rose-700", border: "hover:border-rose-400/60", tags: ["Packing", "Loading"], active: false },
  { key: "shipment", route: null, title: "Shipment Tracking", desc: "Container shipment lifecycle — booking, BL, tracking, delivery confirmation", icon: Ship, color: "indigo", iconBg: "bg-indigo-500/20", iconColor: "text-indigo-600", tagBg: "bg-indigo-500/10 text-indigo-700", border: "hover:border-indigo-400/60", tags: ["Shipping", "BL"], active: false },
  { key: "analytics", route: null, title: "SC Analytics", desc: "Supply chain dashboards — lead times, vendor performance, cost trends", icon: BarChart3, color: "pink", iconBg: "bg-pink-500/20", iconColor: "text-pink-600", tagBg: "bg-pink-500/10 text-pink-700", border: "hover:border-pink-400/60", tags: ["Analytics", "KPIs"], active: false },
];

// Integration settings — stored as key/value rows in sc_settings.
// Secrets are masked by the API (••••last4) and skipped on save if unchanged.
const INTEG_FIELDS: { key: string; label: string; secret?: boolean; select?: string[]; hint?: string }[] = [
  { key: "whatsapp_provider", label: "WhatsApp Provider", select: ["meta", "360dialog"] },
  { key: "whatsapp_token", label: "Meta Access Token", secret: true, hint: "Meta provider only" },
  { key: "whatsapp_phone_id", label: "Meta Phone Number ID", hint: "Meta provider only" },
  { key: "whatsapp_api_key", label: "360dialog API Key", secret: true, hint: "360dialog provider only" },
  { key: "resend_api_key", label: "Resend API Key", secret: true, hint: "for email notifications" },
  { key: "notify_email_from", label: "Email From Address", hint: "e.g. supply@kafi.com" },
  { key: "app_base_url", label: "App URL for links", hint: "https://your-app.vercel.app" },
];

type Recipient = {
  id: string; name: string; designation: string | null;
  whatsapp: string | null; email: string | null; staff_id: string | null;
  notify_events: string[] | null; approver_events: string[] | null;
};

type StaffOption = { id: string; displayName: string };

const EMPTY_RECIP = { name: "", designation: "", whatsapp: "", email: "", staffId: "", notifyEvents: [] as string[], approverEvents: [] as string[] };

export default function SupplyChainPage() {
  const router = useRouter();
  const [user, setUser] = useState<StaffSession | null>(null);
  const [checked, setChecked] = useState(false);

  // Integrations modal (super admin)
  const [showInteg, setShowInteg] = useState(false);
  const [integ, setInteg] = useState<Record<string, string>>({});
  const [integLoading, setIntegLoading] = useState(false);
  const [integSaving, setIntegSaving] = useState(false);
  const [integSaved, setIntegSaved] = useState(false);

  // Team recipients (notification timeline)
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [recipForm, setRecipForm] = useState<typeof EMPTY_RECIP | null>(null);
  const [editingRecipId, setEditingRecipId] = useState<string | null>(null);
  const [recipSaving, setRecipSaving] = useState(false);

  async function loadRecipients() {
    try {
      const r = await fetch("/api/supply-chain/recipients");
      const d = await r.json();
      setRecipients(d.recipients ?? []);
    } catch { /* */ }
  }

  async function openInteg() {
    setShowInteg(true);
    setIntegSaved(false);
    setIntegLoading(true);
    setRecipForm(null);
    setEditingRecipId(null);
    try {
      const r = await fetch("/api/supply-chain/settings");
      const d = await r.json();
      setInteg(d.settings ?? {});
    } catch { /* */ }
    loadRecipients();
    fetch("/api/staff").then(r => r.json()).then(d => {
      setStaffOptions(((d.staff ?? []) as { id: string; displayName: string }[]).map(s => ({ id: s.id, displayName: s.displayName })));
    }).catch(() => {});
    setIntegLoading(false);
  }

  function startEditRecip(r: Recipient) {
    setEditingRecipId(r.id);
    setRecipForm({
      name: r.name, designation: r.designation || "", whatsapp: r.whatsapp || "",
      email: r.email || "", staffId: r.staff_id || "",
      notifyEvents: r.notify_events ?? [], approverEvents: r.approver_events ?? [],
    });
  }

  async function saveRecip() {
    if (!recipForm || !recipForm.name.trim()) return;
    setRecipSaving(true);
    await fetch("/api/supply-chain/recipients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: editingRecipId ? "update" : "add",
        id: editingRecipId ?? undefined,
        name: recipForm.name, designation: recipForm.designation,
        whatsapp: recipForm.whatsapp, email: recipForm.email,
        staffId: recipForm.staffId || null,
        notifyEvents: recipForm.notifyEvents, approverEvents: recipForm.approverEvents,
      }),
    });
    setRecipSaving(false);
    setRecipForm(null);
    setEditingRecipId(null);
    loadRecipients();
  }

  async function deleteRecip(id: string) {
    await fetch("/api/supply-chain/recipients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    loadRecipients();
  }

  function toggleRecipEvent(kind: "notifyEvents" | "approverEvents", key: string) {
    setRecipForm(f => {
      if (!f) return f;
      const list = f[kind];
      return { ...f, [kind]: list.includes(key) ? list.filter(x => x !== key) : [...list, key] };
    });
  }

  async function saveInteg() {
    setIntegSaving(true);
    for (const f of INTEG_FIELDS) {
      const value = integ[f.key] ?? "";
      await fetch("/api/supply-chain/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-setting", key: f.key, value }),
      });
    }
    setIntegSaving(false);
    setIntegSaved(true);
  }

  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then(d => {
      if (!d.user || d.user.mustChangePin) { router.replace("/login"); return; }
      setUser(d.user); setChecked(true);
    }).catch(() => router.replace("/login"));
  }, [router]);

  if (!checked) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Hub
            </button>
            <div className="w-px h-6 bg-gray-300" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Supply Chain Agent</h1>
                <p className="text-xs text-gray-500">Query &rarr; CBM &rarr; BOM &rarr; PO &rarr; GRN &rarr; Pack &rarr; Ship</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <User className="w-4 h-4" />
                <span>{user.displayName}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">{user.role.replace("_", " ")}</span>
              </div>
            )}
            {user?.role === "super_admin" && (
              <button onClick={openInteg} title="WhatsApp & Email integrations" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                <Plug className="w-3.5 h-3.5" /> Integrations
              </button>
            )}
            <button onClick={() => { fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }).then(() => router.replace("/login")); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-600 transition-colors cursor-pointer">
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
                    ? `bg-white/70 border-gray-200/80 ${mod.border} hover:bg-white/95 cursor-pointer group`
                    : "bg-white/40 border-gray-100 opacity-50 cursor-default"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl ${mod.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${mod.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold ${mod.active ? "text-gray-900 group-hover:text-emerald-700" : "text-gray-500"} transition-colors`}>{mod.title}</h3>
                      {!mod.active && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">TBA</span>}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{mod.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mod.tags.map(t => (
                        <span key={t} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${mod.tagBg}`}>{t}</span>
                      ))}
                    </div>
                  </div>
                  {mod.active && <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors shrink-0 mt-1" />}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">Kafi Commodities (Pvt) Ltd &middot; Supply Chain Management</p>
      </div>

      {/* Integrations Modal (super admin) */}
      {showInteg && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowInteg(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold flex items-center gap-2"><Plug className="w-4 h-4 text-emerald-600" /> Integrations</h3>
                <p className="text-xs text-gray-500 mt-0.5">WhatsApp &amp; email for PO dispatch and GRN approval — unconfigured messages queue as pending</p>
              </div>
              <button onClick={() => setShowInteg(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {integLoading ? (
                <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" /></div>
              ) : (
                <>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Providers</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {INTEG_FIELDS.map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-gray-500 mb-1 block">{f.label}{f.hint && <span className="text-gray-400"> — {f.hint}</span>}</label>
                        {f.select ? (
                          <select value={integ[f.key] ?? f.select[0]} onChange={e => setInteg(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-emerald-500/50 cursor-pointer">
                            {f.select.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={f.secret ? "password" : "text"} value={integ[f.key] ?? ""} placeholder={f.secret ? "paste key (shown masked)" : ""}
                            onChange={e => setInteg(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Team Recipients — the A→Z notification timeline */}
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Team Recipients</p>
                      <p className="text-[11px] text-gray-400">One WhatsApp business number notifies everyone — each person subscribes to their steps</p>
                    </div>
                    <button onClick={() => { setRecipForm({ ...EMPTY_RECIP }); setEditingRecipId(null); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> Add Person
                    </button>
                  </div>

                  {recipients.length === 0 && !recipForm && (
                    <p className="text-xs text-gray-400 text-center py-3">No recipients yet — add the people who should be notified at each workflow step.</p>
                  )}

                  {recipients.map(r => (
                    <div key={r.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200/80 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{r.name}</span>
                          {r.designation && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200/70 text-gray-500">{r.designation}</span>}
                          {r.whatsapp && <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />}
                          {r.email && <Mail className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {SC_EVENTS.filter(e => (r.notify_events ?? []).includes(e.key)).map(e => (
                            <span key={e.key} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">{e.label}</span>
                          ))}
                          {SC_EVENTS.filter(e => (r.approver_events ?? []).includes(e.key)).map(e => (
                            <span key={"a" + e.key} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700"><ShieldCheck className="w-3 h-3" /> Approver: {e.label}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEditRecip(r)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-900 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteRecip(r.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}

                  {recipForm && (
                    <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.03] space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={recipForm.name} onChange={e => setRecipForm(f => f && ({ ...f, name: e.target.value }))} placeholder="Name *"
                          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50" />
                        <input value={recipForm.designation} onChange={e => setRecipForm(f => f && ({ ...f, designation: e.target.value }))} placeholder="Designation (e.g. Accountant)"
                          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50" />
                        <input value={recipForm.whatsapp} onChange={e => setRecipForm(f => f && ({ ...f, whatsapp: e.target.value }))} placeholder="WhatsApp (92XXXXXXXXXX)"
                          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50" />
                        <input value={recipForm.email} onChange={e => setRecipForm(f => f && ({ ...f, email: e.target.value }))} placeholder="Email"
                          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500/50" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Linked staff login — required for approval rights</label>
                        <select value={recipForm.staffId} onChange={e => setRecipForm(f => f && ({ ...f, staffId: e.target.value }))}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none cursor-pointer">
                          <option value="">— not linked —</option>
                          {staffOptions.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1.5 block">Notify on these steps:</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SC_EVENTS.map(e => (
                            <label key={e.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs cursor-pointer ${recipForm.notifyEvents.includes(e.key) ? "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-800" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                              <input type="checkbox" checked={recipForm.notifyEvents.includes(e.key)} onChange={() => toggleRecipEvent("notifyEvents", e.key)} className="accent-emerald-600" />
                              <span className="flex-1">{e.stage} — {e.label}{e.future ? " (soon)" : ""}</span>
                              {e.gate && (
                                <span className="flex items-center gap-1 text-[10px] text-amber-700 cursor-pointer" onClick={ev => ev.stopPropagation()}>
                                  <input type="checkbox" checked={recipForm.approverEvents.includes(e.key)} onChange={() => toggleRecipEvent("approverEvents", e.key)} className="accent-amber-600" />
                                  approver
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setRecipForm(null); setEditingRecipId(null); }} className="px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-900 cursor-pointer">Cancel</button>
                        <button onClick={saveRecip} disabled={recipSaving || !recipForm.name.trim()}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer">
                          {recipSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          {editingRecipId ? "Update Person" : "Add Person"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200/70">
              {integSaved && <span className="text-xs text-emerald-700">Saved ✓</span>}
              <button onClick={saveInteg} disabled={integSaving || integLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-40 cursor-pointer">
                {integSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Integrations
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
