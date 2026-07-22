"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, TrendingDown, Plus, Trash2, X, Loader2, Check, FileText, Star, Search,
} from "lucide-react";

type Sheet = {
  id: string; title: string; category: string | null;
  margin_scenarios: number[]; show_fob_breakdown: boolean;
};

type Entry = {
  id: string; item_name: string; packaging: string; weight_desc: string;
  forum: string; country: string; price_local: number; currency: string; fx_rate: number;
  is_own_price: boolean; freight_usd: number; duty_pct: number; clearance_usd: number;
};

type CatalogItem = {
  sourceProductId: string; name: string; category: string; packagingDesc: string;
  division: string; divisionLabel: string;
};

// price_usd = price_local / fx_rate
// implied landed cost @ margin% = price_usd * (1 - margin/100)
//   (margin here is % of the SELLING price, not markup-on-cost — matches
//   Hafeez's real comparison sheets exactly)
// implied FOB (deeper breakdown): duty is charged on the CIF value
// (FOB + freight), so this is solved algebraically, not a flat subtraction:
//   landed = FOB*(1+duty%) + freight*(1+duty%) + clearance
//   => FOB = (landed - clearance) / (1+duty%) - freight
function priceUsd(e: Entry) { return e.fx_rate ? e.price_local / e.fx_rate : 0; }
function impliedLanded(e: Entry, marginPct: number) { return priceUsd(e) * (1 - marginPct / 100); }
function impliedFob(e: Entry, marginPct: number) {
  const landed = impliedLanded(e, marginPct);
  const dutyFactor = 1 + (e.duty_pct || 0) / 100;
  return (landed - (e.clearance_usd || 0)) / dutyFactor - (e.freight_usd || 0);
}

export default function ReverseCostingPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Sheet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [scenarioInput, setScenarioInput] = useState("40,50,60");
  const [saving, setSaving] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [pickerForEntry, setPickerForEntry] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pulling, setPulling] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/supply-chain/catalog").then(r => r.json()).then(d => setCatalog(d.catalog ?? [])).catch(() => {});
  }, []);

  async function pullOwnPrice(entryId: string, item: CatalogItem) {
    setPulling(entryId);
    try {
      const r = await fetch(`/api/product-list/selling-price?productId=${item.sourceProductId}&division=${item.division}`);
      const d = await r.json();
      if (d.pricePerUnit !== undefined) {
        const patch = {
          item_name: item.name, packaging: item.packagingDesc, weight_desc: d.unit === "PMT" ? "1 PMT" : "",
          price_local: d.pricePerUnit, currency: "USD", fx_rate: 1, is_own_price: true,
        };
        updateEntryLocal(entryId, patch);
        await saveEntry(entryId, patch);
      }
    } finally {
      setPulling(null);
      setPickerForEntry(null);
      setPickerSearch("");
    }
  }

  async function loadSheets() {
    const r = await fetch("/api/cost-budgeting/reverse");
    const d = await r.json();
    setSheets(d.sheets ?? []);
    setLoading(false);
  }

  useEffect(() => { loadSheets(); }, []);

  async function openSheet(id: string) {
    const r = await fetch(`/api/cost-budgeting/reverse?id=${id}`);
    const d = await r.json();
    setActive(d.sheet);
    setEntries(d.entries ?? []);
    setScenarioInput((d.sheet?.margin_scenarios ?? [40, 50, 60]).join(","));
  }

  async function createSheet() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const r = await fetch("/api/cost-budgeting/reverse", {
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
    await fetch("/api/cost-budgeting/reverse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-sheet", id }),
    });
    setSheets(prev => prev.filter(s => s.id !== id));
    if (active?.id === id) { setActive(null); setEntries([]); }
  }

  async function addEntry() {
    if (!active) return;
    const r = await fetch("/api/cost-budgeting/reverse", {
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
    setSaving(id);
    await fetch("/api/cost-budgeting/reverse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-entry", id, ...patch }),
    });
    setSaving(null);
  }

  async function deleteEntry(id: string) {
    await fetch("/api/cost-budgeting/reverse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-entry", id }),
    });
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  async function saveScenarios() {
    if (!active) return;
    const scenarios = scenarioInput.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0 && n < 100);
    await fetch("/api/cost-budgeting/reverse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-sheet", id: active.id, marginScenarios: scenarios }),
    });
    setActive(a => a && ({ ...a, margin_scenarios: scenarios }));
  }

  async function toggleFobBreakdown() {
    if (!active) return;
    const next = !active.show_fob_breakdown;
    setActive(a => a && ({ ...a, show_fob_breakdown: next }));
    await fetch("/api/cost-budgeting/reverse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-sheet", id: active.id, showFobBreakdown: next }),
    });
  }

  const marginScenarios = active?.margin_scenarios ?? [40, 50, 60];

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#e8ecf1" }}><div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen" style={{ background: "#e8ecf1" }}>
      <div className="max-w-[110rem] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/cost-budgeting")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> Cost / Budgeting
            </button>
            <div className="w-px h-5 bg-gray-300" />
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-orange-600" />
              <h1 className="text-lg font-bold text-gray-900">Reverse Costing</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sheets.length > 0 && (
              <button onClick={() => setActive(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer">
                <FileText className="w-4 h-4" /> All Sheets
              </button>
            )}
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" /> New Comparison Sheet
            </button>
          </div>
        </div>

        {!active ? (
          sheets.length === 0 ? (
            <div className="rounded-xl bg-white/70 border border-gray-200/80 px-6 py-16 text-center">
              <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-1">No comparison sheets yet</p>
              <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" /> New Comparison Sheet
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
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Margin scenarios %</label>
                  <input value={scenarioInput} onChange={e => setScenarioInput(e.target.value)} onBlur={saveScenarios}
                    placeholder="40,50,60" className="w-24 bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={active.show_fob_breakdown} onChange={toggleFobBreakdown} className="accent-orange-600" />
                  Go all the way to FOB
                </label>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 border border-gray-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70">
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-44">Item</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-28">Packaging</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-20">Weight</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-28">Forum</th>
                      <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-24">Country</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-20">Price</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-16">Ccy</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-20">FX Rate</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-20">USD</th>
                      <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-12">Own</th>
                      {active.show_fob_breakdown && <>
                        <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-20">Freight $</th>
                        <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-16">Duty %</th>
                        <th className="text-center px-3 py-2.5 text-gray-500 font-medium w-24">Clear. $</th>
                      </>}
                      {marginScenarios.map(m => (
                        <th key={`c${m}`} className="text-center px-3 py-2.5 text-gray-500 font-medium w-24">Cost @ {m}%</th>
                      ))}
                      {active.show_fob_breakdown && marginScenarios.map(m => (
                        <th key={`f${m}`} className="text-center px-3 py-2.5 text-orange-600 font-medium w-24">FOB @ {m}%</th>
                      ))}
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => {
                      const usd = priceUsd(e);
                      return (
                        <tr key={e.id} className={`border-b border-gray-100 hover:bg-gray-50/80 ${e.is_own_price ? "bg-emerald-500/[0.04]" : ""}`}>
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
                            <input value={e.forum} onChange={ev => updateEntryLocal(e.id, { forum: ev.target.value })} onBlur={() => saveEntry(e.id, { forum: e.forum })}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={e.country} onChange={ev => updateEntryLocal(e.id, { country: ev.target.value })} onBlur={() => saveEntry(e.id, { country: e.country })}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.01" value={e.price_local || ""} onChange={ev => updateEntryLocal(e.id, { price_local: Number(ev.target.value) || 0 })} onBlur={() => saveEntry(e.id, { price_local: e.price_local })}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={e.currency} onChange={ev => updateEntryLocal(e.id, { currency: ev.target.value })} onBlur={() => saveEntry(e.id, { currency: e.currency })}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" step="0.0001" value={e.fx_rate || ""} onChange={ev => updateEntryLocal(e.id, { fx_rate: Number(ev.target.value) || 1 })} onBlur={() => saveEntry(e.id, { fx_rate: e.fx_rate })}
                              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </td>
                          <td className="px-2 py-1.5 text-center text-gray-900 text-xs font-semibold">${usd.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input type="checkbox" checked={e.is_own_price} onChange={ev => { updateEntryLocal(e.id, { is_own_price: ev.target.checked }); saveEntry(e.id, { is_own_price: ev.target.checked }); }} className="accent-emerald-600" />
                              <button onClick={() => setPickerForEntry(e.id)} title="Pull price from Kafi's Product List" className="p-0.5 rounded hover:bg-emerald-500/10 text-emerald-600 cursor-pointer">
                                {pulling === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                              </button>
                            </div>
                          </td>
                          {active.show_fob_breakdown && <>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.01" value={e.freight_usd || ""} onChange={ev => updateEntryLocal(e.id, { freight_usd: Number(ev.target.value) || 0 })} onBlur={() => saveEntry(e.id, { freight_usd: e.freight_usd })}
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.1" value={e.duty_pct || ""} onChange={ev => updateEntryLocal(e.id, { duty_pct: Number(ev.target.value) || 0 })} onBlur={() => saveEntry(e.id, { duty_pct: e.duty_pct })}
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input type="number" step="0.01" value={e.clearance_usd || ""} onChange={ev => updateEntryLocal(e.id, { clearance_usd: Number(ev.target.value) || 0 })} onBlur={() => saveEntry(e.id, { clearance_usd: e.clearance_usd })}
                                className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-xs text-gray-900 focus:outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            </td>
                          </>}
                          {marginScenarios.map(m => (
                            <td key={`c${m}`} className="px-2 py-1.5 text-center text-gray-700 text-xs">${impliedLanded(e, m).toFixed(2)}</td>
                          ))}
                          {active.show_fob_breakdown && marginScenarios.map(m => (
                            <td key={`f${m}`} className="px-2 py-1.5 text-center text-orange-700 text-xs font-semibold">${impliedFob(e, m).toFixed(2)}</td>
                          ))}
                          <td className="px-1 py-1.5">
                            <button onClick={() => deleteEntry(e.id)} className="p-1 rounded hover:bg-red-500/10 text-gray-300 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {entries.length === 0 && <tr><td colSpan={20} className="px-4 py-8 text-center text-gray-400 text-xs">No rows yet — add competitor prices found on each marketplace ("Forum").</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200/70">
                <p className="text-[11px] text-gray-400 flex items-center gap-1"><Star className="w-3 h-3 text-emerald-600" /> Tick "Own" for Kafi's own listed price rows, to benchmark against competitors in the same sheet.</p>
                <button onClick={addEntry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {pickerForEntry && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => { setPickerForEntry(null); setPickerSearch(""); }}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
              <div>
                <h3 className="text-gray-900 font-semibold">Pull Price from Product List</h3>
                <p className="text-xs text-gray-500 mt-0.5">Selects the product, computes its current FOB price live, and fills this row</p>
              </div>
              <button onClick={() => { setPickerForEntry(null); setPickerSearch(""); }} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search products..." autoFocus
                  className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-orange-500/50" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {catalog.filter(c => c.name.toLowerCase().includes(pickerSearch.toLowerCase())).slice(0, 50).map(c => (
                <button key={c.sourceProductId} onClick={() => pullOwnPrice(pickerForEntry, c)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-2.5 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-gray-900 text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-gray-500 truncate">{c.divisionLabel}{c.category && ` · ${c.category}`}</div>
                  </div>
                </button>
              ))}
              {catalog.length === 0 && <div className="px-5 py-10 text-center text-gray-400 text-sm">No products in the catalog yet.</div>}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowCreate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-900 font-semibold">New Comparison Sheet</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <label className="text-xs text-gray-500 mb-1 block">Title</label>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Fried Onion - Saudi Comparison"
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
