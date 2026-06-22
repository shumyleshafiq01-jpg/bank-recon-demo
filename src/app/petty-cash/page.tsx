"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Plus, Trash2, Download,
  Wallet, Lock, Unlock, ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface PettyCashEntry {
  id: string;
  date: string;
  acHead: string;
  txnNo: string;
  purpose: string;
  approvedBy: string;
  cashOut: number | null;
  cashIn: number | null;
}

const STORAGE_KEY_ENTRIES = "pc_entries";
const STORAGE_KEY_CONFIG = "pc_config";

const genId = () => Math.random().toString(36).slice(2, 10);

const fmt = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtBal = (n: number) =>
  n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function emptyEntry(monthKey?: string): PettyCashEntry {
  const today = new Date().toISOString().slice(0, 10);
  let date = today;
  if (monthKey) {
    const [y, m] = monthKey.split("-");
    const nowKey = today.slice(0, 7);
    date = monthKey === nowKey ? today : `${y}-${m}-01`;
  }
  return {
    id: genId(), date, acHead: "", txnNo: "",
    purpose: "", approvedBy: "", cashOut: null, cashIn: null,
  };
}

/* ═══════════════════════════════════════════
   BALANCE HELPERS
   ═══════════════════════════════════════════ */
function computeRunningBalances(entries: PettyCashEntry[], openingBalance: number): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, number>();
  let running = openingBalance;
  for (const e of sorted) {
    running += (e.cashIn ?? 0) - (e.cashOut ?? 0);
    map.set(e.id, running);
  }
  return map;
}

function getMonthStartBalance(monthKey: string, entries: PettyCashEntry[], openingBalance: number): number {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let running = openingBalance;
  for (const e of sorted) {
    if (!e.date || e.date.slice(0, 7) >= monthKey) break;
    running += (e.cashIn ?? 0) - (e.cashOut ?? 0);
  }
  return running;
}

function getMonthKeys(entries: PettyCashEntry[]): string[] {
  const months = new Set<string>();
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  for (const e of entries) {
    if (e.date?.length >= 7) months.add(e.date.slice(0, 7));
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
export default function PettyCashPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingDate, setOpeningDate] = useState("");
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingDraft, setOpeningDraft] = useState({ balance: 0, date: "" });

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [syncError, setSyncError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [undoState, setUndoState] = useState<{ entry: PettyCashEntry; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from Google Sheets
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/petty-cash");
        if (res.ok) {
          const data = await res.json();
          if (data.entries !== undefined) {
            setEntries(data.entries as PettyCashEntry[]);
            setOpeningBalance(data.openingBalance ?? 0);
            setOpeningDate(data.openingDate ?? "");
            setLastSync(new Date().toLocaleTimeString());
            setLoaded(true);
            return;
          }
        }
      } catch { /* fall back to localStorage */ }

      try {
        const e = localStorage.getItem(STORAGE_KEY_ENTRIES);
        const c = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (e) setEntries(JSON.parse(e));
        if (c) {
          const cfg = JSON.parse(c);
          setOpeningBalance(cfg.openingBalance ?? 0);
          setOpeningDate(cfg.openingDate ?? "");
        }
      } catch { /* ignore */ }
      setLoaded(true);
    }
    load();
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(entries));
  }, [entries, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ openingBalance, openingDate }));
  }, [openingBalance, openingDate, loaded]);

  // Debounced sync to Google Sheets
  const syncToSheets = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSyncing(true);
      try {
        const res = await fetch("/api/petty-cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries, openingBalance, openingDate }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.saved) {
          setLastSync(new Date().toLocaleTimeString());
          setSyncError("");
        } else {
          setSyncError(data.error || "Sync failed");
        }
      } catch {
        setSyncError("Network error");
      }
      setSyncing(false);
    }, 1500);
  }, [entries, openingBalance, openingDate]);

  useEffect(() => {
    if (!loaded) return;
    syncToSheets();
  }, [entries, openingBalance, openingDate, loaded, syncToSheets]);

  // Derived data
  const balanceMap = useCallback(
    () => computeRunningBalances(entries, openingBalance),
    [entries, openingBalance]
  );

  const monthKeys = getMonthKeys(entries);

  function getMonthEntries(monthKey: string) {
    return entries
      .filter((e) => e.date?.slice(0, 7) === monthKey)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function updateEntry(id: string, field: keyof PettyCashEntry, value: string | number | null) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  }

  function addEntry() {
    if (!selectedMonth) return;
    setEntries((prev) => [...prev, emptyEntry(selectedMonth)]);
  }

  function deleteEntry(id: string) {
    const allSorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const index = allSorted.findIndex((e) => e.id === id);
    const entry = allSorted[index];
    if (!entry) return;

    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoState({ entry, index });
    undoTimer.current = setTimeout(() => setUndoState(null), 5000);
  }

  function undoDelete() {
    if (!undoState) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setEntries((prev) => [...prev, undoState.entry]);
    setUndoState(null);
  }

  function saveOpeningBalance() {
    setOpeningBalance(openingDraft.balance);
    setOpeningDate(openingDraft.date);
    setEditingOpening(false);
  }

  function downloadXLS() {
    const wb = XLSX.utils.book_new();
    const bm = balanceMap();

    // Summary sheet
    const summaryRows: (string | number)[][] = [
      ["PETTY CASH — KAFI COMMODITIES (PVT.) LIMITED"],
      ["Month", "Cash Out", "Cash In", "Closing Balance"],
    ];
    for (const mk of [...monthKeys].reverse()) {
      const me = getMonthEntries(mk);
      const startBal = getMonthStartBalance(mk, entries, openingBalance);
      const totalOut = me.reduce((s, e) => s + (e.cashOut ?? 0), 0);
      const totalIn = me.reduce((s, e) => s + (e.cashIn ?? 0), 0);
      const closing = startBal - totalOut + totalIn;
      summaryRows.push([monthLabel(mk), totalOut, totalIn, closing]);
    }
    const ws0 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws0["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws0, "Summary");

    // Each month as a sheet
    for (const mk of [...monthKeys].reverse()) {
      const me = getMonthEntries(mk);
      const startBal = getMonthStartBalance(mk, entries, openingBalance);
      const sheetRows: (string | number)[][] = [
        ["DATE", "A/C HEAD", "TXN #", "PURPOSE", "APPROVED BY", "CASH OUT", "CASH IN", "BALANCE"],
        ["", "", "", "BEGINNING BALANCE", "", "", "", startBal],
        ...me.map((e) => [
          e.date, e.acHead, e.txnNo, e.purpose, e.approvedBy,
          e.cashOut ?? "", e.cashIn ?? "", bm.get(e.id) ?? "",
        ]),
      ];
      const totalOut = me.reduce((s, e) => s + (e.cashOut ?? 0), 0);
      const totalIn = me.reduce((s, e) => s + (e.cashIn ?? 0), 0);
      const closing = (bm.get(me[me.length - 1]?.id ?? "") ?? startBal);
      sheetRows.push(["TOTAL", "", "", "", "", totalOut, totalIn, closing]);

      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, monthLabel(mk).slice(0, 31));
    }

    XLSX.writeFile(wb, "Petty-Cash-Flow.xlsx");
  }

  if (!loaded) return null;

  const bm = balanceMap();

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
          <Wallet className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Petty Cash Flow</span>
        {syncing ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-semibold animate-pulse">Syncing...</span>
        ) : syncError ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-semibold" title={syncError}>Sync error</span>
        ) : lastSync ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-semibold">Synced {lastSync}</span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">Local Only</span>
        )}
        <div className="ml-auto">
          {entries.length > 0 && (
            <button onClick={downloadXLS} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-500/80 text-white rounded-lg cursor-pointer transition-colors">
              <Download className="w-3 h-3" /> Export XLS
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

          {/* Opening Balance Card */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">Opening Balance</p>
                {editingOpening ? (
                  <div className="flex items-center gap-3 mt-2">
                    <div>
                      <label className="text-[10px] text-muted block mb-1">Amount (PKR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={openingDraft.balance}
                        onChange={(e) => setOpeningDraft((p) => ({ ...p, balance: parseFloat(e.target.value) || 0 }))}
                        className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-orange-500/50 w-40"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted block mb-1">Date</label>
                      <input
                        type="date"
                        value={openingDraft.date}
                        onChange={(e) => setOpeningDraft((p) => ({ ...p, date: e.target.value }))}
                        className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <button onClick={saveOpeningBalance} className="px-4 py-1.5 bg-orange-500 hover:bg-orange-500/80 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">Save</button>
                      <button onClick={() => setEditingOpening(false)} className="px-3 py-1.5 text-xs text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xl font-bold text-orange-400">{fmtBal(openingBalance)}</span>
                    {openingDate && <span className="text-xs text-muted">as of {openingDate}</span>}
                  </div>
                )}
              </div>
              {!editingOpening && (
                <button
                  onClick={() => { setOpeningDraft({ balance: openingBalance, date: openingDate }); setEditingOpening(true); }}
                  className="text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-orange-500/40 rounded-lg cursor-pointer transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Month Cards */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Monthly Overview</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {monthKeys.map((mk) => {
                const me = getMonthEntries(mk);
                const startBal = getMonthStartBalance(mk, entries, openingBalance);
                const totalOut = me.reduce((s, e) => s + (e.cashOut ?? 0), 0);
                const totalIn = me.reduce((s, e) => s + (e.cashIn ?? 0), 0);
                const lastEntry = me.length > 0 ? me[me.length - 1] : null;
                const closingBal = lastEntry ? (bm.get(lastEntry.id) ?? startBal) : startBal;
                const isSelected = selectedMonth === mk;

                return (
                  <div
                    key={mk}
                    onClick={() => { setSelectedMonth(isSelected ? null : mk); setEditMode(false); }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-orange-500/60 bg-orange-500/5"
                        : "border-border hover:border-orange-500/30 bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-foreground">{monthLabel(mk)}</span>
                      <ChevronRight className={`w-3.5 h-3.5 text-muted transition-transform ${isSelected ? "rotate-90" : ""}`} />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div>
                        <p className="text-muted">Cash Out</p>
                        <p className="font-mono font-semibold text-red-400">{totalOut > 0 ? totalOut.toLocaleString("en-PK") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted">Cash In</p>
                        <p className="font-mono font-semibold text-emerald-400">{totalIn > 0 ? totalIn.toLocaleString("en-PK") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted">Balance</p>
                        <p className="font-mono font-semibold text-orange-400">{closingBal.toLocaleString("en-PK")}</p>
                      </div>
                    </div>
                    {me.length > 0 && (
                      <p className="text-[9px] text-muted mt-2">{me.length} entr{me.length === 1 ? "y" : "ies"}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly Ledger (expanded) */}
          {selectedMonth && (() => {
            const me = getMonthEntries(selectedMonth);
            const startBal = getMonthStartBalance(selectedMonth, entries, openingBalance);
            const totalOut = me.reduce((s, e) => s + (e.cashOut ?? 0), 0);
            const totalIn = me.reduce((s, e) => s + (e.cashIn ?? 0), 0);

            return (
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                {/* Month header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{monthLabel(selectedMonth)}</h3>
                    <p className="text-xs text-muted mt-0.5">
                      Beginning Balance: <span className="text-orange-400 font-semibold">{fmtBal(startBal)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted uppercase tracking-wide">Closing Balance</p>
                    <p className="text-lg font-bold text-orange-400">
                      {(() => {
                        const last = me[me.length - 1];
                        return fmtBal(last ? (bm.get(last.id) ?? startBal) : startBal);
                      })()}
                    </p>
                  </div>
                </div>

                {/* Edit toggle */}
                <div className="px-5 py-2.5 border-b border-border/50 flex items-center justify-between">
                  <button
                    onClick={() => setEditMode((v) => !v)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all font-semibold ${
                      editMode
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-surface-light/50 text-muted border border-border hover:text-foreground"
                    }`}
                  >
                    {editMode ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {editMode ? "Editing — Click to Lock" : "Edit Ledger"}
                  </button>
                  {editMode && <span className="text-[10px] text-amber-400">Ledger is unlocked for editing</span>}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-orange-500/10 text-orange-400">
                        <th className="px-2 py-2.5 text-left font-semibold w-[36px]">#</th>
                        <th className="px-2 py-2.5 text-left font-semibold w-[110px]">Date</th>
                        <th className="px-2 py-2.5 text-left font-semibold w-[160px]">A/C Head</th>
                        <th className="px-2 py-2.5 text-left font-semibold w-[110px]">TXN / Cheque #</th>
                        <th className="px-2 py-2.5 text-left font-semibold">Purpose</th>
                        <th className="px-2 py-2.5 text-left font-semibold w-[100px]">Approved By</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Cash Out</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Cash In</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[130px]">Balance</th>
                        <th className="px-2 py-2.5 text-center w-[36px]">{editMode && <Trash2 className="w-3 h-3 text-muted mx-auto" />}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Beginning Balance row */}
                      <tr className="bg-orange-500/5 text-muted italic">
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2 text-[10px]"></td>
                        <td className="px-2 py-2" colSpan={6}><span className="text-[10px] font-semibold not-italic text-orange-400/70">BEGINNING BALANCE</span></td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-orange-400">{fmtBal(startBal)}</td>
                        <td></td>
                      </tr>

                      {me.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-4 py-8 text-center text-muted">
                            No entries for {monthLabel(selectedMonth)}. {editMode ? 'Click "Add Row" below.' : 'Click "Edit Ledger" to add entries.'}
                          </td>
                        </tr>
                      )}

                      {me.map((entry, i) => {
                        const balance = bm.get(entry.id) ?? startBal;
                        return (
                          <tr key={entry.id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <input
                                type="date"
                                value={entry.date}
                                onChange={(e) => updateEntry(entry.id, "date", e.target.value)}
                                disabled={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={entry.acHead}
                                onChange={(e) => updateEntry(entry.id, "acHead", e.target.value)}
                                placeholder={editMode ? "A/C Head..." : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={entry.txnNo}
                                onChange={(e) => updateEntry(entry.id, "txnNo", e.target.value)}
                                placeholder={editMode ? "—" : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={entry.purpose}
                                onChange={(e) => updateEntry(entry.id, "purpose", e.target.value)}
                                placeholder={editMode ? "Enter purpose..." : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={entry.approvedBy}
                                onChange={(e) => updateEntry(entry.id, "approvedBy", e.target.value)}
                                placeholder={editMode ? "—" : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={entry.cashOut === null ? "" : entry.cashOut}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^0-9.]/g, "");
                                  updateEntry(entry.id, "cashOut", v === "" ? null : parseFloat(v) || 0);
                                }}
                                placeholder={editMode ? "—" : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-right text-red-400 font-mono focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={entry.cashIn === null ? "" : entry.cashIn}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^0-9.]/g, "");
                                  updateEntry(entry.id, "cashIn", v === "" ? null : parseFloat(v) || 0);
                                }}
                                placeholder={editMode ? "—" : ""}
                                readOnly={!editMode}
                                className={`w-full bg-transparent rounded px-1.5 py-1 text-right text-emerald-400 font-mono focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                              />
                            </td>
                            <td className={`px-2 py-1.5 text-right font-mono font-semibold ${balance < 0 ? "text-red-400" : "text-foreground"}`}>
                              {fmtBal(balance)}
                            </td>
                            <td className="px-2 py-1.5">
                              {editMode && (
                                <button onClick={() => deleteEntry(entry.id)} className="p-1 text-muted hover:text-red-400 cursor-pointer transition-colors">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals row */}
                {me.length > 0 && (
                  <div className="px-5 py-3 border-t border-border bg-orange-500/5 flex items-center justify-between text-xs">
                    <span className="text-muted font-semibold">{me.length} entries</span>
                    <div className="flex items-center gap-6">
                      <span className="text-red-400 font-mono font-semibold">OUT: {totalOut.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span>
                      <span className="text-emerald-400 font-mono font-semibold">IN: {totalIn > 0 ? totalIn.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "—"}</span>
                      <span className="text-orange-400 font-mono font-bold">
                        BAL: {fmtBal((() => { const l = me[me.length - 1]; return l ? (bm.get(l.id) ?? startBal) : startBal; })())}
                      </span>
                    </div>
                  </div>
                )}

                {/* Add Row */}
                {editMode && (
                  <div className="px-5 py-3 border-t border-border">
                    <button onClick={addEntry} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 cursor-pointer transition-colors">
                      <Plus className="w-3 h-3" /> Add Row
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* Undo toast */}
      {undoState && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 shadow-xl animate-fade-in">
          <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-sm text-foreground">Row deleted</span>
          <button onClick={undoDelete} className="text-sm font-semibold text-orange-400 hover:text-orange-300 cursor-pointer transition-colors">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
