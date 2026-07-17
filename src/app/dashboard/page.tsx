"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  Landmark, ArrowRight, Clock, User, Building2, CreditCard,
  Globe, FileText, LogOut, Scale, BookOpen, Wallet, Banknote, Zap, Settings, Package,
  Users, Shield, ToggleLeft, ToggleRight, UserPlus, KeyRound, Loader2,
} from "lucide-react";

type StaffSession = {
  id: string;
  username: string;
  displayName: string;
  role: "super_admin" | "admin" | "staff";
  mustChangePin: boolean;
};

type StaffMember = {
  id: string; username: string; displayName: string; role: string;
  mustChangePin: boolean; active: boolean; modules: Record<string, boolean>;
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
    for (let i = 0; i < count; i++) {
      nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, radius: Math.random() * 2 + 1.5 });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if (nodesRef.current.length === 0) init(canvas.width, canvas.height); };
    resize();
    window.addEventListener("resize", resize);
    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMouse);
    const draw = () => {
      const w = canvas.width; const h = canvas.height; ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current; const mouse = mouseRef.current;
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1;
        const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180) { n.vx += dx * 0.00008; n.vy += dy * 0.00008; }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x; const dy = nodes[i].y - nodes[j].y; const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) { ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.strokeStyle = `rgba(59,130,246,${(1 - dist / 140) * 0.18})`; ctx.lineWidth = 0.8; ctx.stroke(); }
        }
      }
      for (const n of nodes) {
        const dx = mouse.x - n.x; const dy = mouse.y - n.y; const dist = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = dist < 200 ? `rgba(59,130,246,${0.5 + (1 - dist / 200) * 0.5})` : "rgba(59,130,246,0.35)"; ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); window.removeEventListener("mousemove", onMouse); };
  }, [init]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

const MODULES = [
  { key: "multi-bank", route: "/multi-bank", title: "Multi-Bank Adjustments", desc: "ABL, HMB, Faysal, Soneri — auto-detect format, match by date & amount", icon: Building2, color: "violet", iconBg: "bg-violet-500/20", iconColor: "text-violet-400", tagBg: "bg-violet-500/10 text-violet-300", border: "hover:border-violet-400/60", tags: ["Multi-Bank", "PDF / XLS / CSV"] },
  { key: "credit-card", route: "/credit-card", title: "Credit Card Verification", desc: "Auto-group by merchant, tick-verify against receipts, SCB format export", icon: CreditCard, color: "rose", iconBg: "bg-rose-500/20", iconColor: "text-rose-400", tagBg: "bg-rose-500/10 text-rose-300", border: "hover:border-rose-400/60", tags: ["Credit Card", "Tick Verify"] },
  { key: "international", route: "/international", title: "International Recon", desc: "Any bank worldwide — AI auto-detects format, multi-currency matching", icon: Globe, color: "cyan", iconBg: "bg-cyan-500/20", iconColor: "text-cyan-400", tagBg: "bg-cyan-500/10 text-cyan-300", border: "hover:border-cyan-400/60", tags: ["AI Auto-Detect", "Multi-Currency"] },
  { key: "statement-digitizer", route: "/statement-digitizer", title: "Statement Digitizer", desc: "3-step AI pipeline — validate, extract, reconcile any bank statement", icon: FileText, color: "teal", iconBg: "bg-teal-500/20", iconColor: "text-teal-400", tagBg: "bg-teal-500/10 text-teal-300", border: "hover:border-teal-400/60", tags: ["Step A-B-C", "Blueprint Learning"] },
  { key: "ledger-vs-ledger", route: "/ledger-vs-ledger", title: "Ledger vs Ledger", desc: "Company vs vendor ledger — match by amount & date, flag discrepancies", icon: BookOpen, color: "orange", iconBg: "bg-orange-500/20", iconColor: "text-orange-400", tagBg: "bg-orange-500/10 text-orange-300", border: "hover:border-orange-400/60", tags: ["Cross-Verify", "XLS Match"] },
  { key: "quotations", route: "/quotations", title: "Quotation Comparison", desc: "Multi-vendor AI extraction — side-by-side with cheapest price highlight", icon: Scale, color: "amber", iconBg: "bg-amber-500/20", iconColor: "text-amber-400", tagBg: "bg-amber-500/10 text-amber-300", border: "hover:border-amber-400/60", tags: ["Multi-Vendor", "AI Extraction"] },
  { key: "expense-analyzer", route: "/expense-analyzer", title: "Expense Analyzer", desc: "Wise multi-currency statements — filter, chat, PKR conversion", icon: Wallet, color: "emerald", iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400", tagBg: "bg-emerald-500/10 text-emerald-300", border: "hover:border-emerald-400/60", tags: ["Wise Card", "Chat & Filter"] },
  { key: "vendors", route: "/vendors", title: "Master Directory", desc: "Vendor profiles — contacts, rates, tax filer status, NTN, bank accounts", icon: Building2, color: "blue", iconBg: "bg-blue-500/20", iconColor: "text-blue-400", tagBg: "bg-blue-500/10 text-blue-300", border: "hover:border-blue-400/60", tags: ["Vendors", "Bank Details"] },
  { key: "reminders", route: "/reminders", title: "Reminders", desc: "Global reminders for the team — one-time, weekly or monthly, shown on every module login", icon: Zap, color: "amber", iconBg: "bg-amber-500/20", iconColor: "text-amber-400", tagBg: "bg-amber-500/10 text-amber-300", border: "hover:border-amber-400/60", tags: ["Global", "All Modules"] },
  { key: "petty-cash", route: "/petty-cash", title: "Petty Cash Flow", desc: "Daily petty cash register — month-wise view, running balance, cash in/out tracking", icon: Wallet, color: "orange", iconBg: "bg-orange-500/20", iconColor: "text-orange-400", tagBg: "bg-orange-500/10 text-orange-300", border: "hover:border-orange-400/60", tags: ["Daily Cash", "Month View"] },
  { key: "fund-estimator", route: "/fund-estimator", title: "Fund Estimation Workspace", desc: "Live collaborative ledger — multi-bank balances, PDC tracking, real-time workspace", icon: Banknote, color: "indigo", iconBg: "bg-indigo-500/20", iconColor: "text-indigo-400", tagBg: "bg-indigo-500/10 text-indigo-300", border: "hover:border-indigo-400/60", tags: ["Multi-Bank", "PDC Tracking"] },
];

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StaffSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [apiUsage, setApiUsage] = useState<{ totalCost: number; totalCalls: number } | null>(null);

  // Staff management (super_admin only)
  const [showStaffPanel, setShowStaffPanel] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  // Module access
  const [userModules, setUserModules] = useState<Record<string, boolean>>({});
  // Global hidden modules (legacy compat)
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth")
      .then(r => r.json())
      .then(d => {
        if (!d.user) { router.replace("/login"); return; }
        if (d.user.mustChangePin) { router.replace("/login"); return; }
        setUser(d.user);
        setChecked(true);
      })
      .catch(() => router.replace("/login"));

    fetch("/api/usage").then(r => r.json()).then(d => setApiUsage(d)).catch(() => {});
    fetch("/api/dashboard-config").then(r => r.json()).then(d => setHiddenModules(d.hiddenModules ?? [])).catch(() => {});
  }, [router]);

  // Load user's module permissions
  useEffect(() => {
    if (!user) return;
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "my-modules" }) })
      .then(r => r.json()).then(() => {}).catch(() => {});
  }, [user]);

  async function logout() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    router.replace("/login");
  }

  async function loadStaff() {
    setStaffLoading(true);
    try {
      const r = await fetch("/api/staff");
      const d = await r.json();
      setStaffList(d.staff ?? []);
    } catch { /* */ }
    setStaffLoading(false);
  }

  async function addStaff() {
    if (!newUsername.trim() || !newDisplayName.trim()) return;
    setAddingStaff(true);
    await fetch("/api/staff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", username: newUsername.trim().toLowerCase(), displayName: newDisplayName.trim() }),
    });
    setNewUsername(""); setNewDisplayName("");
    setAddingStaff(false);
    loadStaff();
  }

  async function toggleStaffActive(staffId: string, active: boolean) {
    await fetch("/api/staff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", staffId, active }),
    });
    loadStaff();
  }

  async function resetPin(staffId: string) {
    await fetch("/api/staff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-pin", staffId }),
    });
    loadStaff();
  }

  async function toggleStaffModule(staffId: string, moduleSlug: string, allowed: boolean) {
    await fetch("/api/staff", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-module", staffId, moduleSlug, allowed }),
    });
    setStaffList(prev => prev.map(s =>
      s.id === staffId ? { ...s, modules: { ...s.modules, [moduleSlug]: allowed } } : s
    ));
  }

  async function toggleGlobalModule(key: string) {
    const next = hiddenModules.includes(key) ? hiddenModules.filter(k => k !== key) : [...hiddenModules, key];
    setHiddenModules(next);
    await fetch("/api/dashboard-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenModules: next }),
    }).catch(() => {});
  }

  function openStaffPanel() {
    setShowStaffPanel(true);
    loadStaff();
  }

  if (!checked) return null;

  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin" || isSuperAdmin;

  // Filter modules: super_admin sees all; admin sees non-hidden; staff sees non-hidden + their allowed modules
  const visibleModules = MODULES.filter(m => {
    if (isSuperAdmin) return true;
    if (hiddenModules.includes(m.key)) return false;
    if (user?.role === "staff" && userModules[m.key] === false) return false;
    return true;
  });

  const roleLabel = user?.role === "super_admin" ? "Super Admin" : user?.role === "admin" ? "Admin" : "Staff";
  const roleBg = user?.role === "super_admin" ? "bg-amber-100 text-amber-700" : user?.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";

  return (
    <div className="flex-1 flex flex-col min-h-screen" style={{ background: "#e8ecf1" }}>
      <NeuronBackground />

      {/* Top Bar */}
      <header className="relative z-10 border-b border-gray-300/60 bg-white/70 backdrop-blur-xl px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/20">
            <Landmark className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Kafi AI Platform</h1>
            <p className="text-xs text-gray-500">Kafi Commodities (Pvt) Ltd</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium">{user?.displayName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleBg}`}>{roleLabel}</span>
          </div>

          {/* Settings dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1 p-1.5 rounded-lg cursor-pointer transition-colors text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <Settings className="w-3.5 h-3.5" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              {isSuperAdmin && (
                <>
                  <button onClick={openStaffPanel} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                    <Users className="w-3.5 h-3.5 text-gray-400" /> Staff Management
                  </button>
                  <div className="border-t border-gray-100" />
                </>
              )}
              <button onClick={() => router.push("/settings")} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors text-left">
                <Settings className="w-3.5 h-3.5 text-gray-400" /> API Settings
              </button>
            </div>
          </div>

          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer bg-gray-50 hover:bg-red-50 rounded-lg px-3 py-1.5">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full space-y-8">
        <div className="animate-fade-in">
          <h2 className="text-2xl font-bold text-gray-900">Modules</h2>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.displayName}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 animate-fade-in">
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center"><Landmark className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Modules</p>
                <p className="text-xl font-bold text-gray-900">{visibleModules.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center"><Clock className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Reconciliations</p>
                <p className="text-xl font-bold text-gray-900">0</p>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-xl border border-gray-200/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center"><Zap className="w-4 h-4 text-purple-600" /></div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">API Credits Used</p>
                <p className="text-xl font-bold text-purple-600">${apiUsage ? apiUsage.totalCost.toFixed(4) : "---"}</p>
                {apiUsage && apiUsage.totalCalls > 0 && <p className="text-[10px] text-gray-400">{apiUsage.totalCalls} AI call{apiUsage.totalCalls !== 1 ? "s" : ""}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Module grid */}
        {isSuperAdmin && (
          <p className="text-xs text-amber-600 font-medium -mb-1">
            <Shield className="w-3 h-3 inline mr-1" />
            Super Admin — you can toggle module visibility globally via Staff Management
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-fade-in">
          {visibleModules.map(mod => {
            const Icon = mod.icon;
            const isHidden = hiddenModules.includes(mod.key);
            return (
              <div key={mod.key} className="relative group">
                <button
                  onClick={() => router.push(mod.route)}
                  className={`w-full flex items-center gap-3.5 bg-white/65 backdrop-blur-sm hover:bg-white/95 rounded-xl border border-gray-200/80 ${mod.border} shadow-sm hover:shadow-md transition-all cursor-pointer text-left px-4 py-3 ${isHidden ? "opacity-50" : ""}`}
                >
                  <div className={`w-9 h-9 rounded-lg ${mod.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${mod.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">{mod.title}</p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {mod.tags.map(tag => (
                        <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${mod.tagBg}`}>{tag}</span>
                      ))}
                      {isHidden && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-500">Hidden</span>}
                    </div>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 text-gray-300 group-hover:${mod.iconColor} transition-colors shrink-0`} />
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 pb-6">Kafi AI Platform &middot; Sheikh Shumyle &middot; 2026</p>
      </div>

      {/* Staff Management Panel (super_admin only) */}
      {showStaffPanel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">Staff Management</h2>
              </div>
              <button onClick={() => setShowStaffPanel(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-xl leading-none">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Add new staff */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Username</label>
                  <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="e.g. ali"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-500 font-medium uppercase">Display Name</label>
                  <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="e.g. Ali Khan"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 mt-1" />
                </div>
                <button onClick={addStaff} disabled={addingStaff}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {addingStaff ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Add
                </button>
              </div>

              {/* Staff list */}
              {staffLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : (
                <div className="space-y-3">
                  {staffList.map(s => {
                    const rLabel = s.role === "super_admin" ? "Super Admin" : s.role === "admin" ? "Admin" : "Staff";
                    const rBg = s.role === "super_admin" ? "bg-amber-100 text-amber-700" : s.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600";
                    return (
                      <div key={s.id} className={`border border-gray-200 rounded-xl p-4 ${!s.active ? "opacity-50" : ""}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{s.displayName}</span>
                            <span className="text-xs text-gray-400">@{s.username}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${rBg}`}>{rLabel}</span>
                            {s.mustChangePin && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-500">PIN change required</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => resetPin(s.id)} title="Reset PIN to 1111"
                              className="text-xs text-gray-400 hover:text-amber-600 cursor-pointer flex items-center gap-1">
                              <KeyRound className="w-3 h-3" /> Reset PIN
                            </button>
                            {s.role !== "super_admin" && (
                              <button onClick={() => toggleStaffActive(s.id, !s.active)}
                                className={`text-xs cursor-pointer flex items-center gap-1 ${s.active ? "text-green-600 hover:text-red-500" : "text-red-500 hover:text-green-600"}`}>
                                {s.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                {s.active ? "Active" : "Inactive"}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Module toggles */}
                        {s.role !== "super_admin" && (
                          <div className="flex flex-wrap gap-1.5">
                            {MODULES.map(m => {
                              const allowed = s.modules[m.key] !== false;
                              return (
                                <button key={m.key} onClick={() => toggleStaffModule(s.id, m.key, !allowed)}
                                  className={`text-[10px] px-2 py-1 rounded-lg font-medium cursor-pointer border transition-all ${
                                    allowed
                                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                      : "bg-red-50 text-red-500 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                                  }`}>
                                  {m.title.replace("Multi-Bank Adjustments", "Multi-Bank").replace("Credit Card Verification", "Credit Card").replace("International Recon", "Int'l Recon").replace("Statement Digitizer", "Digitizer").replace("Ledger vs Ledger", "Ledger Match").replace("Quotation Comparison", "Quotations").replace("Expense Analyzer", "Expenses").replace("Master Directory", "Directory").replace("Fund Estimation Workspace", "Fund Est.").replace("Petty Cash Flow", "Petty Cash")}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
