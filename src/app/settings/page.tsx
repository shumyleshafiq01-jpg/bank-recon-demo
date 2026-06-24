"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Settings, Zap, Building2, BarChart3, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

interface Dept {
  id: string;
  deptName: string;
  maskedKey: string;
  createdAt: string;
}

interface UsageData {
  totalCost: number;
  totalCalls: number;
  byDept: Record<string, { deptName: string; calls: number; inputTokens: number; outputTokens: number; costUSD: number }>;
  byModule: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUSD: number }>;
  recentLogs: { timestamp: string; deptName: string; module: string; model: string; inputTokens: number; outputTokens: number; costUSD: number }[];
}

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN;

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"usage" | "depts">("usage");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState("");
  const [adminError, setAdminError] = useState("");

  // Dept keys
  const [depts, setDepts] = useState<Dept[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deptLoading, setDeptLoading] = useState(false);

  // Usage
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageView, setUsageView] = useState<"dept" | "module" | "recent">("dept");

  // Active dept (stored in localStorage)
  const [activeDeptId, setActiveDeptId] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kafi_admin_verified");
      if (saved === "true") setIsAdmin(true);
      setActiveDeptId(localStorage.getItem("kafi_active_dept_id") || "");
    } catch { /* */ }
    loadUsage();
  }, []);

  async function loadUsage() {
    setUsageLoading(true);
    try {
      const res = await fetch("/api/settings?type=usage");
      if (res.ok) setUsage(await res.json());
    } catch { /* */ }
    setUsageLoading(false);
  }

  async function loadDepts() {
    setDeptLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) setDepts((await res.json()).depts ?? []);
    } catch { /* */ }
    setDeptLoading(false);
  }

  function verifyAdmin() {
    if (adminInput.trim() === ADMIN_PIN) {
      setIsAdmin(true);
      localStorage.setItem("kafi_admin_verified", "true");
      setAdminError("");
      loadDepts();
    } else {
      setAdminError("Incorrect admin PIN.");
    }
  }

  async function addDept() {
    if (!newDeptName.trim() || !newApiKey.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-dept", deptName: newDeptName.trim(), apiKey: newApiKey.trim() }),
      });
      setNewDeptName(""); setNewApiKey("");
      await loadDepts();
    } catch { /* */ }
    setSaving(false);
  }

  async function deleteDept(id: string) {
    if (!confirm("Remove this department key?")) return;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-dept", deptId: id }),
    });
    await loadDepts();
    if (activeDeptId === id) { setActiveDeptId(""); localStorage.removeItem("kafi_active_dept_id"); }
  }

  function selectDept(id: string, name: string) {
    setActiveDeptId(id);
    localStorage.setItem("kafi_active_dept_id", id);
    localStorage.setItem("kafi_active_dept_name", name);
  }

  const fmt = (n: number) => `$${n.toFixed(4)}`;
  const fmtTokens = (n: number) => n.toLocaleString();

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center"><Settings className="w-3.5 h-3.5 text-indigo-400" /></div>
        <span className="text-sm font-bold text-foreground">Settings</span>
        {activeDeptId && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold">
            Active: {localStorage.getItem("kafi_active_dept_name") || activeDeptId}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1 w-fit">
            <button onClick={() => { setTab("usage"); loadUsage(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${tab === "usage" ? "bg-indigo-500 text-white" : "text-muted hover:text-foreground"}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Usage Dashboard
            </button>
            <button onClick={() => { setTab("depts"); if (isAdmin) loadDepts(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${tab === "depts" ? "bg-indigo-500 text-white" : "text-muted hover:text-foreground"}`}>
              <Building2 className="w-3.5 h-3.5" /> Department API Keys
            </button>
          </div>

          {/* ── USAGE DASHBOARD ── */}
          {tab === "usage" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total AI Calls", value: usage?.totalCalls.toLocaleString() ?? "—", icon: Zap, color: "indigo" },
                  { label: "Total Cost (USD)", value: usage ? fmt(usage.totalCost) : "—", icon: BarChart3, color: "amber" },
                  { label: "Departments", value: usage ? Object.keys(usage.byDept).length : "—", icon: Building2, color: "blue" },
                  { label: "Modules Used", value: usage ? Object.keys(usage.byModule).length : "—", icon: Settings, color: "purple" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-surface rounded-2xl border border-border p-4">
                    <div className={`w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center mb-2`}>
                      <Icon className={`w-4 h-4 text-${color}-400`} />
                    </div>
                    <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
                    <p className="text-xl font-bold text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-surface rounded-xl border border-border p-1 w-fit text-xs">
                {(["dept", "module", "recent"] as const).map(v => (
                  <button key={v} onClick={() => setUsageView(v)}
                    className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all capitalize ${usageView === v ? "bg-indigo-500 text-white" : "text-muted hover:text-foreground"}`}>
                    {v === "dept" ? "By Department" : v === "module" ? "By Module" : "Recent Logs"}
                  </button>
                ))}
              </div>

              {usageLoading ? (
                <div className="bg-surface rounded-2xl border border-border p-8 text-center text-muted">Loading usage data...</div>
              ) : !usage || usage.totalCalls === 0 ? (
                <div className="bg-surface rounded-2xl border border-border p-8 text-center text-muted">No usage data yet. AI calls will appear here once made.</div>
              ) : (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  {usageView === "dept" && (
                    <table className="w-full text-xs">
                      <thead><tr className="bg-indigo-500/10 text-indigo-400">
                        <th className="px-4 py-3 text-left font-semibold">#</th>
                        <th className="px-4 py-3 text-left font-semibold">Department</th>
                        <th className="px-4 py-3 text-right font-semibold">Calls</th>
                        <th className="px-4 py-3 text-right font-semibold">Input Tokens</th>
                        <th className="px-4 py-3 text-right font-semibold">Output Tokens</th>
                        <th className="px-4 py-3 text-right font-semibold">Cost (USD)</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(usage.byDept).map(([id, d], i) => (
                          <tr key={id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-3 text-muted">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{d.deptName}</td>
                            <td className="px-4 py-3 text-right text-foreground">{d.calls.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(d.inputTokens)}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(d.outputTokens)}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">{fmt(d.costUSD)}</td>
                          </tr>
                        ))}
                        <tr className="bg-indigo-500/5 border-t border-border font-bold">
                          <td colSpan={5} className="px-4 py-3 text-right">TOTAL</td>
                          <td className="px-4 py-3 text-right font-mono text-indigo-400">{fmt(usage.totalCost)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  {usageView === "module" && (
                    <table className="w-full text-xs">
                      <thead><tr className="bg-indigo-500/10 text-indigo-400">
                        <th className="px-4 py-3 text-left font-semibold">#</th>
                        <th className="px-4 py-3 text-left font-semibold">Module</th>
                        <th className="px-4 py-3 text-right font-semibold">Calls</th>
                        <th className="px-4 py-3 text-right font-semibold">Input Tokens</th>
                        <th className="px-4 py-3 text-right font-semibold">Output Tokens</th>
                        <th className="px-4 py-3 text-right font-semibold">Cost (USD)</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(usage.byModule).sort(([,a],[,b]) => b.costUSD - a.costUSD).map(([mod, d], i) => (
                          <tr key={mod} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-3 text-muted">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{mod}</td>
                            <td className="px-4 py-3 text-right text-foreground">{d.calls.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(d.inputTokens)}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(d.outputTokens)}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">{fmt(d.costUSD)}</td>
                          </tr>
                        ))}
                        <tr className="bg-indigo-500/5 border-t border-border font-bold">
                          <td colSpan={5} className="px-4 py-3 text-right">TOTAL</td>
                          <td className="px-4 py-3 text-right font-mono text-indigo-400">{fmt(usage.totalCost)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  {usageView === "recent" && (
                    <table className="w-full text-xs">
                      <thead><tr className="bg-indigo-500/10 text-indigo-400">
                        <th className="px-4 py-3 text-left font-semibold">Time</th>
                        <th className="px-4 py-3 text-left font-semibold">Department</th>
                        <th className="px-4 py-3 text-left font-semibold">Module</th>
                        <th className="px-4 py-3 text-right font-semibold">Tokens In</th>
                        <th className="px-4 py-3 text-right font-semibold">Tokens Out</th>
                        <th className="px-4 py-3 text-right font-semibold">Cost</th>
                      </tr></thead>
                      <tbody>
                        {usage.recentLogs.map((log, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-3 text-muted">{new Date(log.timestamp).toLocaleString("en-PK")}</td>
                            <td className="px-4 py-3 text-foreground">{log.deptName || "Default"}</td>
                            <td className="px-4 py-3 text-foreground">{log.module}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(log.inputTokens)}</td>
                            <td className="px-4 py-3 text-right text-muted">{fmtTokens(log.outputTokens)}</td>
                            <td className="px-4 py-3 text-right font-mono text-amber-400">{fmt(log.costUSD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── DEPARTMENT API KEYS ── */}
          {tab === "depts" && (
            !isAdmin ? (
              <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm mx-auto space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Admin Access Required</h3>
                <input type="password" value={adminInput} onChange={e => { setAdminInput(e.target.value); setAdminError(""); }}
                  onKeyDown={e => e.key === "Enter" && verifyAdmin()}
                  placeholder="Enter admin PIN" autoFocus
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-indigo-500/50" />
                {adminError && <p className="text-xs text-red-400">{adminError}</p>}
                <button onClick={verifyAdmin} className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer">Verify</button>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Active dept selector */}
                {depts.length > 0 && (
                  <div className="bg-surface rounded-2xl border border-border p-4">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Active Department</h4>
                    <p className="text-xs text-muted mb-3">Select the department whose API key will be used for all AI calls from this browser.</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setActiveDeptId(""); localStorage.removeItem("kafi_active_dept_id"); localStorage.removeItem("kafi_active_dept_name"); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${!activeDeptId ? "bg-indigo-500 text-white border-indigo-500" : "text-muted border-border hover:text-foreground"}`}>
                        Default (System Key)
                      </button>
                      {depts.map(d => (
                        <button key={d.id} onClick={() => selectDept(d.id, d.deptName)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${activeDeptId === d.id ? "bg-indigo-500 text-white border-indigo-500" : "text-muted border-border hover:text-foreground"}`}>
                          {d.deptName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add new dept */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Add Department API Key</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Department Name</label>
                      <input type="text" value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="e.g. Accounts"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Anthropic API Key</label>
                      <div className="relative">
                        <input type={showKey ? "text" : "password"} value={newApiKey} onChange={e => setNewApiKey(e.target.value)} placeholder="sk-ant-api03-..."
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:border-indigo-500/50" />
                        <button onClick={() => setShowKey(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-pointer">
                          {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={addDept} disabled={!newDeptName.trim() || !newApiKey.trim() || saving}
                      className="flex items-center gap-1.5 px-5 py-2 bg-indigo-500 hover:bg-indigo-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-50">
                      <Plus className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Add Department"}
                    </button>
                  </div>
                </div>

                {/* Dept list */}
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Configured Departments <span className="text-indigo-400">{depts.length}</span></h4>
                  </div>
                  {deptLoading ? (
                    <p className="text-sm text-muted text-center py-8">Loading...</p>
                  ) : depts.length === 0 ? (
                    <p className="text-sm text-muted text-center py-8">No departments configured. Add one above.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead><tr className="bg-indigo-500/10 text-indigo-400">
                        <th className="px-4 py-3 text-left font-semibold">#</th>
                        <th className="px-4 py-3 text-left font-semibold">Department</th>
                        <th className="px-4 py-3 text-left font-semibold">API Key</th>
                        <th className="px-4 py-3 text-left font-semibold">Added</th>
                        <th className="px-4 py-3 text-center font-semibold">Actions</th>
                      </tr></thead>
                      <tbody>
                        {depts.map((d, i) => (
                          <tr key={d.id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-3 text-muted">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-foreground">{d.deptName}</td>
                            <td className="px-4 py-3 font-mono text-muted">{d.maskedKey}</td>
                            <td className="px-4 py-3 text-muted">{new Date(d.createdAt).toLocaleDateString("en-PK")}</td>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => deleteDept(d.id)} className="p-1.5 text-muted hover:text-red-400 cursor-pointer transition-colors rounded hover:bg-red-500/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
