"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, TrendingUp, Plus, Trash2, X, Loader2, Check, FileText,
} from "lucide-react";

type Sheet = { id: string; title: string; category: string | null; markup_scenarios: number[] };
type Entry = { id: string; item_name: string; packaging: string; weight_desc: string; our_cost_usd: number };

// suggested price @ markup% = our_cost_usd * (1 + markup/100)
function suggestedPrice(cost: number, markupPct: number) { return cost * (1 + markupPct / 100); }

export default function ForwardCostingPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Sheet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scenarioInput, setScenarioInput] = useState("40,75,100");

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadSheets() {
    const r = await fetch("/api/cost-budgeting/forward");
    const d = await r.json();
    setSheets(d.sheets ?? []);
    setLoading(false);
  }

  useEffect(() => { loadSheets(); }, []);

  async function openSheet(id: string) {
    const r = await fetch(`/api/cost-budgeting/forward?id=${id}`);
    const d = await r.json();
    setActive(d.sheet);
    setEntries(d.entries ?? []);
    setScenarioInput((d.sheet?.markup_scenarios ?? [40, 75, 100]).join(","));
  }

  async function createSheet() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const r = await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-sheet", title: newTitle, category: newCategory }),
    });
    const d = await r.json();
    setCreating(false);
    setShowCreate(false);
    setNewTitle(""); setNewCategory("");
    if (d.id) { await loadSheets(); openSheet(d.id); }
  }

  async function deleteSheet(id: string) {
    await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-sheet", id }),
    });
    setSheets(prev => prev.filter(s => s.id !== id));
    if (active?.id === id) { setActive(null); setEntries([]); }
  }

  async function addEntry() {
    if (!active) return;
    const r = await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-entry", sheetId: active.id }),
    });
    const d = await r.json();
    if (d.id) openSheet(active.id);
  }

  function updateEntryLocal(id: string, patch: Partial<Entry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  async function saveEntry(id: string, patch: Partial<Entry>) {
    await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-entry", id, ...patch }),
    });
  }

  async function deleteEntry(id: string) {
    await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-entry", id }),
    });
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  async function saveScenarios() {
    if (!active) return;
    const scenarios = scenarioInput.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
    await fetch("/api/cost-budgeting/forward", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-sheet", id: active.id, markupScenarios: scenarios }),
    });
    setActive(a => a && ({ ...a, markup_scenarios: scenarios }));
  }

  const markupScenarios = active?.markup_scenarios ?? [40, 75, 100];

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/cost-budgeting")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Cost / Budgeting
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Forward Costing</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sheets.length > 0 && (
              <button onClick={() => setActive(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                <FileText className="w-4 h-4" /> All Sheets
              </button>
            )}
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Pricing Sheet
            </button>
          </div>
        </div>

        {!active ? (
          sheets.length === 0 ? (
            <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-1">No pricing sheets yet</p>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" /> New Pricing Sheet
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sheets.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/70 border border-gray-200/80">
                  <button onClick={() => openSheet(s.id)} className="flex-1 text-left cursor-pointer">
                    <div className="text-gray-900 font-medium text-sm">{s.title}</div>
                    {s.category && <div className="text-xs text-gray-500">{s.category}</div>}
                  </button>
                  <button onClick={() => deleteSheet(s.id)} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl bg-white/70 border border-gray-200/80">
              <div>
                <h2 className="text-gray-900 font-semibold">{active.title}</h2>
                {active.category && <p className="text-xs text-gray-500">{active.category}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500">Markup scenarios %</label>
                <input value={scenarioInput} onChange={e => setScenarioInput(e.target.value)} onBlur={saveScenarios}
                  placeholder="40,75,100" className="w-28 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
              </div>
            </div>

            <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70">
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium">Item</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-32">Packaging</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-24">Weight</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-28">Our Cost (USD)</th>
                      {markupScenarios.map(m => (
                        <th key={m} className="text-center px-3 py-2.5 text-gray-500 font-medium w-32">Suggested @ +{m}%</th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-2 py-1.5">
                          <input value={e.item_name} onChange={ev => updateEntryLocal(e.id, { item_name: ev.target.value })} onBlur={() => saveEntry(e.id, { item_name: e.item_name })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={e.packaging} onChange={ev => updateEntryLocal(e.id, { packaging: ev.target.value })} onBlur={() => saveEntry(e.id, { packaging: e.packaging })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={e.weight_desc} onChange={ev => updateEntryLocal(e.id, { weight_desc: ev.target.value })} onBlur={() => saveEntry(e.id, { weight_desc: e.weight_desc })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" value={e.our_cost_usd || ""} onChange={ev => updateEntryLocal(e.id, { our_cost_usd: Number(ev.target.value) || 0 })} onBlur={() => saveEntry(e.id, { our_cost_usd: e.our_cost_usd })}
                            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </td>
                        {markupScenarios.map(m => (
                          <td key={m} className="px-2 py-1.5 text-center text-emerald-700 text-xs font-semibold">${suggestedPrice(e.our_cost_usd, m).toFixed(2)}</td>
                        ))}
                        <td className="px-1 py-1.5">
                          <button onClick={() => deleteEntry(e.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                        </td>
                      </tr>
                    ))}
                    {entries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">No rows yet — add items with Kafi's known cost.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end px-4 py-3 border-t border-gray-200/70">
                <button onClick={addEntry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold">New Pricing Sheet</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <label className="text-xs text-gray-500 mb-1 block">Title</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Fried Onion - Our Pricing"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-3 focus:outline-none focus:border-orange-500/50" />
            <label className="text-xs text-gray-500 mb-1 block">Category (optional)</label>
            <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. Fried Onion"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 mb-4 focus:outline-none focus:border-orange-500/50" />
            <button onClick={createSheet} disabled={creating || !newTitle.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-orange-600 hover:bg-orange-500 text-white font-medium disabled:opacity-40 cursor-pointer">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
