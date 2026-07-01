"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Plus, Trash2, Download,
  Wallet, Lock, Unlock, ChevronRight, ChevronLeft, CalendarDays, X,
  HandCoins, Calculator, Check, AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import ReminderBell from "@/components/ReminderBell";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
type CashHolder = "main" | "aa1" | "aa2";

interface PettyCashEntry {
  id: string;
  date: string;
  acHead: string;
  txnNo: string;
  purpose: string;
  approvedBy: string;
  cashOut: number | null;
  cashIn: number | null;
  holder: CashHolder;
}

interface CashHandover {
  id: string; date: string; holder: "aa1" | "aa2"; amount: number; notes: string; givenBy: string; createdAt: string;
}

const DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10];

interface DenominationCount {
  id: string; date: string; holder: "aa1" | "aa2"; denominations: Record<string, number>; total: number; countedBy: string; createdAt: string;
}

const HOLDER_LABELS: Record<CashHolder, string> = { main: "Main Box", aa1: "AA1 (Moiz)", aa2: "AA2 (Hamza)" };

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
    purpose: "", approvedBy: "", cashOut: null, cashIn: null, holder: "aa2",
  };
}

/* ═══════════════════════════════════════════
   PIN / SESSION
   ═══════════════════════════════════════════ */
type PCRole = "accountant" | "aa1" | "aa2";
interface PCSession { role: PCRole; name: string; }

const PC_PINS: Record<string, PCSession> = {
  [process.env.NEXT_PUBLIC_FE_PIN_ACCOUNTANT || ""]: { role: "accountant", name: "A.Hafeez" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA1 || ""]:        { role: "aa1",        name: "Moiz" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA2 || ""]:        { role: "aa2",        name: "Hamza" },
};
const PC_SESSION_KEY = "pc_session";

function PCPinModal({ onSuccess, onClose }: {
  onSuccess: (s: PCSession) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const s = PC_PINS[pin.trim()];
    if (!s) { setError("Incorrect PIN."); return; }
    onSuccess(s);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">Enter PIN</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ml-auto">Petty Cash</span>
        </div>
        <input
          type="password"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Enter your PIN"
          autoFocus
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-orange-500/50 mb-3"
        />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">Confirm</button>
        </div>
      </div>
    </div>
  );
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
/* ═══════════════════════════════════════════
   CALENDAR WIDGET
   ═══════════════════════════════════════════ */
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function CalendarWidget({ entries, selectedDate, onSelectDate, viewMonth, onChangeMonth }: {
  entries: PettyCashEntry[];
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  viewMonth: string;
  onChangeMonth: (m: string) => void;
}) {
  const [y, m] = viewMonth.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
  const today = new Date().toISOString().slice(0, 10);
  const entryDates = new Set(entries.map((e) => e.date).filter((d) => d?.slice(0, 7) === viewMonth));

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    const d = new Date(y, m - 1 + delta, 1);
    onChangeMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="bg-background rounded-xl border border-border p-3 w-full">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shiftMonth(-1)} className="p-1 text-muted hover:text-foreground cursor-pointer rounded">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-semibold text-foreground">{monthLabel(viewMonth)}</span>
        <button onClick={() => shiftMonth(1)} className="p-1 text-muted hover:text-foreground cursor-pointer rounded">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-[9px] text-muted text-center font-semibold py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="aspect-square" />;
          const dateStr = `${viewMonth}-${String(day).padStart(2, "0")}`;
          const hasEntries = entryDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === today;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(isSelected ? null : dateStr)}
              className={`relative flex flex-col items-center justify-center aspect-square rounded-lg text-[11px] cursor-pointer transition-all ${
                isSelected
                  ? "bg-orange-500 text-white font-bold"
                  : isToday
                  ? "border border-orange-500/50 text-orange-400 font-semibold hover:bg-orange-500/10"
                  : hasEntries
                  ? "text-foreground hover:bg-orange-500/10"
                  : "text-muted/60 hover:bg-surface-light/30"
              }`}
            >
              {day}
              {hasEntries && !isSelected && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-400" />
              )}
            </button>
          );
        })}
      </div>
      {selectedDate && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-orange-400 font-semibold">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </span>
          <button onClick={() => onSelectDate(null)} className="text-[10px] text-muted hover:text-foreground cursor-pointer flex items-center gap-0.5">
            <X className="w-2.5 h-2.5" /> Clear
          </button>
        </div>
      )}
    </div>
  );
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [editMode, setEditMode] = useState(false);

  // Date filter for expanded ledger
  type FilterMode = "single" | "range" | "all";
  const [filterMode, setFilterMode] = useState<FilterMode>("single");
  const [filterSingle, setFilterSingle] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [syncError, setSyncError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [undoState, setUndoState] = useState<{ entry: PettyCashEntry; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session / PIN
  const [session, setSession] = useState<PCSession | null>(null);
  const [pinModal, setPinModal] = useState<{ action: (s: PCSession) => void } | null>(null);

  // Cash Handover
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [denomCounts, setDenomCounts] = useState<DenominationCount[]>([]);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [showDenomModal, setShowDenomModal] = useState<"aa1" | "aa2" | null>(null);
  const [showHandoverHistory, setShowHandoverHistory] = useState<"aa1" | "aa2" | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PC_SESSION_KEY);
      if (saved) setSession(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function login(s: PCSession) {
    localStorage.setItem(PC_SESSION_KEY, JSON.stringify(s));
    setSession(s);
    setPinModal(null);
  }

  function logout() {
    localStorage.removeItem(PC_SESSION_KEY);
    setSession(null);
  }

  function requireAuth(action: (s: PCSession) => void) {
    if (session) { action(session); return; }
    setPinModal({ action });
  }

  function handleDateSelect(date: string | null) {
    if (date) {
      const mk = date.slice(0, 7);
      setSelectedMonth(mk);
      setCalendarViewMonth(mk);
      setFilterMode("single");
      setFilterSingle(date);
    }
  }

  function openMonth(mk: string) {
    setSelectedMonth(mk);
    setCalendarViewMonth(mk);
    setFilterMode("single");
    const today = new Date().toISOString().slice(0, 10);
    setFilterSingle(today.slice(0, 7) === mk ? today : `${mk}-01`);
    setFilterFrom(`${mk}-01`);
    const lastDay = new Date(parseInt(mk.slice(0, 4)), parseInt(mk.slice(5)), 0).getDate();
    setFilterTo(`${mk}-${String(lastDay).padStart(2, "0")}`);
    setEditMode(false);
  }

  // Load Cash Handover data
  useEffect(() => {
    fetch("/api/petty-cash/handovers").then(r => r.json()).then(d => setHandovers(d.handovers ?? [])).catch(() => {});
    fetch("/api/petty-cash/denominations").then(r => r.json()).then(d => setDenomCounts(d.counts ?? [])).catch(() => {});
  }, []);

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
            setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("pc_sync", new Date().toLocaleTimeString()); } catch {};
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
          setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("pc_sync", new Date().toLocaleTimeString()); } catch {};
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

  // Cash in hand for a given holder = handovers received + cashIn - cashOut on entries tagged to that holder
  function cashInHand(holder: "aa1" | "aa2"): number {
    const handedTotal = handovers.filter(h => h.holder === holder).reduce((s, h) => s + h.amount, 0);
    const entryNet = entries.filter(e => e.holder === holder)
      .reduce((s, e) => s + (e.cashIn ?? 0) - (e.cashOut ?? 0), 0);
    return handedTotal + entryNet;
  }

  function totalHandedOver(holder: "aa1" | "aa2"): number {
    return handovers.filter(h => h.holder === holder).reduce((s, h) => s + h.amount, 0);
  }

  function lastDenomCount(holder: "aa1" | "aa2"): DenominationCount | null {
    const list = denomCounts.filter(c => c.holder === holder).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list[0] ?? null;
  }

  async function createHandover(h: { date: string; holder: "aa1" | "aa2"; amount: number; notes: string; givenBy: string }) {
    await fetch("/api/petty-cash/handovers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", handover: h }),
    });
    const res = await fetch("/api/petty-cash/handovers");
    const data = await res.json();
    setHandovers(data.handovers ?? []);
  }

  async function deleteHandover(id: string) {
    await fetch("/api/petty-cash/handovers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setHandovers(prev => prev.filter(h => h.id !== id));
  }

  async function saveDenomCount(c: { date: string; holder: "aa1" | "aa2"; denominations: Record<string, number>; total: number; countedBy: string }) {
    await fetch("/api/petty-cash/denominations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", count: c }),
    });
    const res = await fetch("/api/petty-cash/denominations");
    const data = await res.json();
    setDenomCounts(data.counts ?? []);
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
        <div className="ml-auto flex items-center gap-2">
          {session && <ReminderBell role={session.role} name={session.name} />}
          {session && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 font-semibold">
                {session.role === "accountant" ? "Accountant" : session.role === "aa1" ? "AA1" : "AA2"}: {session.name}
              </span>
              <button onClick={logout} className="text-[10px] text-muted hover:text-red-400 cursor-pointer transition-colors">Logout</button>
            </div>
          )}
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
                  onClick={() => requireAuth(() => { setOpeningDraft({ balance: openingBalance, date: openingDate }); setEditingOpening(true); })}
                  className="text-xs px-3 py-1.5 border border-border text-muted hover:text-foreground hover:border-orange-500/40 rounded-lg cursor-pointer transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Month Cards + Calendar */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Monthly Overview</h3>
              <button
                onClick={() => setCalendarOpen((v) => !v)}
                className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  calendarOpen
                    ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                    : "text-muted border-border hover:text-foreground hover:border-orange-500/30"
                }`}
              >
                <CalendarDays className="w-3 h-3" />
                {filterMode === "single" && filterSingle ? filterSingle : "Calendar"}
              </button>
            </div>

            <div className={calendarOpen ? "grid grid-cols-1 lg:grid-cols-3 gap-4" : ""}>
              {/* Month cards */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${calendarOpen ? "lg:col-span-2" : "lg:grid-cols-3"}`}>
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
                      onClick={() => {
                        if (isSelected) { setSelectedMonth(null); }
                        else { openMonth(mk); }
                      }}
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

              {/* Calendar widget */}
              {calendarOpen && (
                <div className="lg:col-span-1">
                  <CalendarWidget
                    entries={entries}
                    selectedDate={filterMode === "single" ? filterSingle : null}
                    onSelectDate={handleDateSelect}
                    viewMonth={calendarViewMonth}
                    onChangeMonth={setCalendarViewMonth}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cash Handover */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <HandCoins className="w-3.5 h-3.5 text-orange-400" />
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Cash Handover</h3>
              </div>
              {session?.role === "accountant" && (
                <button onClick={() => setShowHandoverForm(true)} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 bg-orange-500 hover:bg-orange-500/80 text-white rounded-lg cursor-pointer transition-colors">
                  <Plus className="w-3 h-3" /> New Handover
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["aa1", "aa2"] as const).map((holder) => {
                const inHand = cashInHand(holder);
                const handedTotal = totalHandedOver(holder);
                const lastCount = lastDenomCount(holder);
                const variance = lastCount ? lastCount.total - inHand : null;
                return (
                  <div key={holder} className="p-3 rounded-xl border border-border bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-foreground">{HOLDER_LABELS[holder]}</span>
                      <button onClick={() => setShowDenomModal(holder)} className="flex items-center gap-1 text-[9px] px-2 py-1 border border-border text-muted hover:text-foreground hover:border-orange-500/40 rounded-lg cursor-pointer transition-colors">
                        <Calculator className="w-2.5 h-2.5" /> Count Cash
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
                      <div>
                        <p className="text-muted">Total Handed Over</p>
                        <p className="font-mono font-semibold text-foreground">{handedTotal > 0 ? handedTotal.toLocaleString("en-PK") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted">Cash In Hand</p>
                        <p className="font-mono font-bold text-orange-400">{fmtBal(inHand)}</p>
                      </div>
                    </div>
                    {lastCount ? (
                      <div className={`flex items-center gap-1.5 text-[9px] px-2 py-1.5 rounded-lg ${variance === 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                        {variance === 0 ? <Check className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                        {variance === 0
                          ? `Verified ${lastCount.date} — matches physical count`
                          : `Variance ${lastCount.date}: counted ${fmtBal(lastCount.total)} (${variance! > 0 ? "+" : ""}${fmtBal(variance!)})`}
                      </div>
                    ) : (
                      <p className="text-[9px] text-muted italic">No physical count recorded yet.</p>
                    )}
                    <button onClick={() => setShowHandoverHistory(showHandoverHistory === holder ? null : holder)} className="text-[9px] text-muted hover:text-orange-400 cursor-pointer mt-2 transition-colors">
                      {showHandoverHistory === holder ? "Hide history" : "Show handover history"}
                    </button>
                    {showHandoverHistory === holder && (
                      <div className="mt-2 pt-2 border-t border-border space-y-1 max-h-40 overflow-y-auto">
                        {handovers.filter(h => h.holder === holder).sort((a, b) => b.date.localeCompare(a.date)).map(h => (
                          <div key={h.id} className="flex items-center justify-between text-[9px]">
                            <span className="text-muted">{h.date} — {h.notes || "Handover"}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-emerald-400">+{h.amount.toLocaleString("en-PK")}</span>
                              {session?.role === "accountant" && (
                                <button onClick={() => deleteHandover(h.id)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-2.5 h-2.5" /></button>
                              )}
                            </div>
                          </div>
                        ))}
                        {handovers.filter(h => h.holder === holder).length === 0 && (
                          <p className="text-[9px] text-muted italic">No handovers recorded yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ledger (expanded) */}
          {selectedMonth && (() => {
            const allMonthEntries = getMonthEntries(selectedMonth);
            const monthStart = getMonthStartBalance(selectedMonth, entries, openingBalance);

            // Apply filter
            const me = (() => {
              if (filterMode === "single" && filterSingle)
                return allMonthEntries.filter((e) => e.date === filterSingle);
              if (filterMode === "range" && filterFrom && filterTo)
                return allMonthEntries.filter((e) => e.date >= filterFrom && e.date <= filterTo);
              return allMonthEntries;
            })();

            // Beginning balance = carry-forward up to start of filter window
            const filterStart = filterMode === "single" ? filterSingle : filterMode === "range" ? filterFrom : null;
            const viewStartBal = filterStart
              ? monthStart + allMonthEntries.filter((e) => e.date < filterStart)
                  .reduce((s, e) => s + (e.cashIn ?? 0) - (e.cashOut ?? 0), 0)
              : monthStart;

            const totalOut = me.reduce((s, e) => s + (e.cashOut ?? 0), 0);
            const totalIn  = me.reduce((s, e) => s + (e.cashIn  ?? 0), 0);
            const showDayGroups = filterMode !== "single";

            const byDate: Record<string, PettyCashEntry[]> = {};
            for (const e of me) {
              const d = e.date || "—";
              if (!byDate[d]) byDate[d] = [];
              byDate[d].push(e);
            }
            const dateDays = Object.keys(byDate).sort();

            // Title string
            const titleStr = (() => {
              if (filterMode === "single" && filterSingle)
                return new Date(filterSingle + "T00:00:00").toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              if (filterMode === "range" && filterFrom && filterTo)
                return `${filterFrom}  →  ${filterTo}`;
              return monthLabel(selectedMonth);
            })();

            const lastDay = new Date(parseInt(selectedMonth.slice(0, 4)), parseInt(selectedMonth.slice(5)), 0).getDate();

            return (
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{titleStr}</h3>
                    <p className="text-xs text-muted mt-0.5">
                      Beginning Balance: <span className="text-orange-400 font-semibold">{fmtBal(viewStartBal)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted uppercase tracking-wide">Closing Balance</p>
                    <p className="text-lg font-bold text-orange-400">
                      {fmtBal((() => { const l = me[me.length - 1]; return l ? (bm.get(l.id) ?? viewStartBal) : viewStartBal; })())}
                    </p>
                  </div>
                </div>

                {/* Date Filter Panel */}
                <div className="px-5 py-3 border-b border-border bg-surface-light/20">
                  <div className="flex items-center gap-5 flex-wrap">
                    <span className="text-[10px] text-muted font-semibold uppercase tracking-wide shrink-0">View:</span>

                    {/* Single Date */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="filterMode" checked={filterMode === "single"} onChange={() => setFilterMode("single")} className="accent-orange-500" />
                      <span className="text-xs text-foreground">Single Date</span>
                      <input
                        type="date"
                        value={filterSingle}
                        onChange={(e) => { setFilterMode("single"); setFilterSingle(e.target.value); }}
                        min={`${selectedMonth}-01`}
                        max={`${selectedMonth}-${String(lastDay).padStart(2, "0")}`}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-orange-500/50 cursor-pointer"
                      />
                    </label>

                    {/* Date Range */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="filterMode" checked={filterMode === "range"} onChange={() => setFilterMode("range")} className="accent-orange-500" />
                      <span className="text-xs text-foreground">Date Range</span>
                      <input
                        type="date"
                        value={filterFrom}
                        onChange={(e) => { setFilterMode("range"); setFilterFrom(e.target.value); }}
                        min={`${selectedMonth}-01`}
                        max={`${selectedMonth}-${String(lastDay).padStart(2, "0")}`}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-orange-500/50 cursor-pointer"
                      />
                      <span className="text-xs text-muted">→</span>
                      <input
                        type="date"
                        value={filterTo}
                        onChange={(e) => { setFilterMode("range"); setFilterTo(e.target.value); }}
                        min={`${selectedMonth}-01`}
                        max={`${selectedMonth}-${String(lastDay).padStart(2, "0")}`}
                        className="bg-background border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-orange-500/50 cursor-pointer"
                      />
                    </label>

                    {/* Entire Month */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="filterMode" checked={filterMode === "all"} onChange={() => setFilterMode("all")} className="accent-orange-500" />
                      <span className="text-xs text-foreground">Entire Month</span>
                    </label>
                  </div>
                </div>

                {/* Edit toggle */}
                <div className="px-5 py-2.5 border-b border-border/50 flex items-center justify-between">
                  <button
                    onClick={() => { if (editMode) { setEditMode(false); return; } requireAuth(() => setEditMode(true)); }}
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
                        <th className="px-2 py-2.5 text-left font-semibold w-[90px]">Holder</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Cash Out</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Cash In</th>
                        <th className="px-2 py-2.5 text-right font-semibold w-[130px]">Balance</th>
                        <th className="px-2 py-2.5 text-center w-[36px]">{editMode && <Trash2 className="w-3 h-3 text-muted mx-auto" />}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Beginning Balance row */}
                      <tr className="bg-orange-500/5">
                        <td className="px-2 py-2"></td>
                        <td className="px-2 py-2" colSpan={8}><span className="text-[10px] font-semibold text-orange-400/70">BEGINNING BALANCE</span></td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-orange-400">{fmtBal(viewStartBal)}</td>
                        <td></td>
                      </tr>

                      {me.length === 0 && (
                        <tr>
                          <td colSpan={11} className="px-4 py-8 text-center text-muted">
                            {filterMode === "single" && filterSingle ? `No entries for ${filterSingle}.` : `No entries for ${monthLabel(selectedMonth)}.`}
                            {editMode ? ' Click "Add Row" below.' : ' Click "Edit Ledger" to add entries.'}
                          </td>
                        </tr>
                      )}

                      {/* Day-wise grouped rows */}
                      {(() => {
                        let rowCounter = 0;
                        return dateDays.map((date) => {
                          const dayEntries = byDate[date];
                          const dayOut = dayEntries.reduce((s, e) => s + (e.cashOut ?? 0), 0);
                          const dayIn = dayEntries.reduce((s, e) => s + (e.cashIn ?? 0), 0);
                          const lastDayEntry = dayEntries[dayEntries.length - 1];
                          const dayClosingBal = bm.get(lastDayEntry?.id ?? "") ?? viewStartBal;
                          const formattedDate = date !== "—"
                            ? new Date(date + "T00:00:00").toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
                            : "—";

                          return (
                            <>
                              {/* Date sub-header — only in range/all view */}
                              {showDayGroups && (
                                <tr key={`hdr-${date}`} className="bg-surface-light/40">
                                  <td colSpan={11} className="px-3 py-1.5">
                                    <span className="text-[10px] font-bold text-orange-400/80 uppercase tracking-wide">{formattedDate}</span>
                                  </td>
                                </tr>
                              )}

                              {dayEntries.map((entry) => {
                                const balance = bm.get(entry.id) ?? viewStartBal;
                                rowCounter++;
                                const rowNum = rowCounter;
                                return (
                                  <tr key={entry.id} className={rowNum % 2 === 0 ? "bg-surface-light/20" : ""}>
                                    <td className="px-2 py-1.5 text-muted">{rowNum}</td>
                                    <td className="px-2 py-1.5">
                                      <input type="date" value={entry.date}
                                        onChange={(e) => updateEntry(entry.id, "date", e.target.value)}
                                        disabled={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" value={entry.acHead}
                                        onChange={(e) => updateEntry(entry.id, "acHead", e.target.value)}
                                        placeholder={editMode ? "A/C Head..." : ""}
                                        readOnly={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" value={entry.txnNo}
                                        onChange={(e) => updateEntry(entry.id, "txnNo", e.target.value)}
                                        placeholder={editMode ? "—" : ""}
                                        readOnly={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" value={entry.purpose}
                                        onChange={(e) => updateEntry(entry.id, "purpose", e.target.value)}
                                        placeholder={editMode ? "Enter purpose..." : ""}
                                        readOnly={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" value={entry.approvedBy}
                                        onChange={(e) => updateEntry(entry.id, "approvedBy", e.target.value)}
                                        placeholder={editMode ? "—" : ""}
                                        readOnly={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      {editMode ? (
                                        <select value={entry.holder} onChange={(e) => updateEntry(entry.id, "holder", e.target.value)}
                                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-orange-500/50 rounded px-1.5 py-1 text-foreground focus:outline-none text-xs cursor-pointer">
                                          <option value="main">Main</option>
                                          <option value="aa1">AA1</option>
                                          <option value="aa2">AA2</option>
                                        </select>
                                      ) : (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${entry.holder === "aa2" ? "bg-orange-500/10 text-orange-400" : entry.holder === "aa1" ? "bg-blue-500/10 text-blue-400" : "bg-surface-light/50 text-muted"}`}>
                                          {entry.holder === "aa2" ? "AA2" : entry.holder === "aa1" ? "AA1" : "Main"}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" inputMode="decimal"
                                        value={entry.cashOut === null ? "" : entry.cashOut}
                                        onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); updateEntry(entry.id, "cashOut", v === "" ? null : parseFloat(v) || 0); }}
                                        placeholder={editMode ? "—" : ""}
                                        readOnly={!editMode}
                                        className={`w-full bg-transparent rounded px-1.5 py-1 text-right text-red-400 font-mono focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-orange-500/50" : "border border-transparent cursor-default"}`}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="text" inputMode="decimal"
                                        value={entry.cashIn === null ? "" : entry.cashIn}
                                        onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); updateEntry(entry.id, "cashIn", v === "" ? null : parseFloat(v) || 0); }}
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
                                        <button onClick={() => requireAuth(() => deleteEntry(entry.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer transition-colors">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Day total row — only in range/all view */}
                              {showDayGroups && dayEntries.length > 0 && (
                                <tr key={`tot-${date}`} className="bg-orange-500/5 border-t border-orange-500/10">
                                  <td colSpan={7} className="px-3 py-1 text-right text-[10px] text-muted font-semibold">Day Total</td>
                                  <td className="px-2 py-1 text-right text-[10px] font-mono font-semibold text-red-400">{dayOut > 0 ? dayOut.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "—"}</td>
                                  <td className="px-2 py-1 text-right text-[10px] font-mono font-semibold text-emerald-400">{dayIn > 0 ? dayIn.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "—"}</td>
                                  <td className="px-2 py-1 text-right text-[10px] font-mono font-bold text-orange-400">{fmtBal(dayClosingBal)}</td>
                                  <td></td>
                                </tr>
                              )}
                            </>
                          );
                        });
                      })()}
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
                        BAL: {fmtBal((() => { const l = me[me.length - 1]; return l ? (bm.get(l.id) ?? viewStartBal) : viewStartBal; })())}
                      </span>
                      {filterMode !== "all" && (
                        <button onClick={() => setFilterMode("all")} className="text-[10px] text-muted hover:text-orange-400 cursor-pointer transition-colors">
                          Show entire month
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Add Row */}
                {editMode && (
                  <div className="px-5 py-3 border-t border-border">
                    <button onClick={() => requireAuth(() => addEntry())} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 cursor-pointer transition-colors">
                      <Plus className="w-3 h-3" /> Add Row
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* PIN Modal */}
      {pinModal && (
        <PCPinModal
          onSuccess={(s) => { login(s); pinModal.action(s); }}
          onClose={() => setPinModal(null)}
        />
      )}

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

      {/* New Handover Modal */}
      {showHandoverForm && session && (
        <HandoverFormModal
          givenBy={session.name}
          onSave={async (h) => { await createHandover(h); setShowHandoverForm(false); }}
          onClose={() => setShowHandoverForm(false)}
        />
      )}

      {/* Denomination Count Modal */}
      {showDenomModal && session && (
        <DenominationModal
          holder={showDenomModal}
          currentCashInHand={cashInHand(showDenomModal)}
          countedBy={session.name}
          onSave={async (c) => { await saveDenomCount(c); setShowDenomModal(null); }}
          onClose={() => setShowDenomModal(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   CASH HANDOVER MODALS
   ═══════════════════════════════════════════ */
function HandoverFormModal({ givenBy, onSave, onClose }: {
  givenBy: string;
  onSave: (h: { date: string; holder: "aa1" | "aa2"; amount: number; notes: string; givenBy: string }) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [holder, setHolder] = useState<"aa1" | "aa2">("aa2");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (amount <= 0) return;
    setSaving(true);
    await onSave({ date, holder, amount, notes, givenBy });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">New Cash Handover</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Hand Over To</label>
            <div className="flex gap-2">
              {(["aa1", "aa2"] as const).map((h) => (
                <button key={h} onClick={() => setHolder(h)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${holder === h ? "bg-orange-500 text-white border-orange-500" : "border-border text-muted hover:text-foreground"}`}>
                  {HOLDER_LABELS[h]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Amount (PKR)</label>
            <input type="number" value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} autoFocus
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Notes (optional)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Weekly cash advance"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500/50" />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || amount <= 0}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">
            {saving ? "Saving..." : "Hand Over"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DenominationModal({ holder, currentCashInHand, countedBy, onSave, onClose }: {
  holder: "aa1" | "aa2";
  currentCashInHand: number;
  countedBy: string;
  onSave: (c: { date: string; holder: "aa1" | "aa2"; denominations: Record<string, number>; total: number; countedBy: string }) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(DENOMINATIONS.map((d) => [String(d), 0])));
  const [otherAmount, setOtherAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  const total = DENOMINATIONS.reduce((s, d) => s + d * (counts[String(d)] || 0), 0) + otherAmount;
  const variance = total - currentCashInHand;

  async function submit() {
    setSaving(true);
    const denominations = { ...counts, other: otherAmount };
    await onSave({ date, holder, denominations, total, countedBy });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-foreground">Count Physical Cash — {HOLDER_LABELS[holder]}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="mb-3">
          <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500/50" />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="text-xs text-muted w-16 shrink-0">Rs. {d}</span>
              <span className="text-xs text-muted">×</span>
              <input type="number" min={0} value={counts[String(d)] || ""} placeholder="0"
                onChange={(e) => setCounts((p) => ({ ...p, [String(d)]: parseInt(e.target.value) || 0 }))}
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-orange-500/50" />
            </div>
          ))}
          <div className="flex items-center gap-2 col-span-2">
            <span className="text-xs text-muted w-16 shrink-0">Coins/Other</span>
            <input type="number" min={0} value={otherAmount || ""} placeholder="0"
              onChange={(e) => setOtherAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-orange-500/50" />
          </div>
        </div>

        <div className="rounded-xl border border-border p-3 space-y-1.5 bg-background">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Physical Count Total</span>
            <span className="font-mono font-bold text-foreground">{fmtBal(total)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">System Cash In Hand</span>
            <span className="font-mono font-semibold text-foreground">{fmtBal(currentCashInHand)}</span>
          </div>
          <div className={`flex items-center gap-1.5 text-xs pt-1.5 border-t border-border ${variance === 0 ? "text-emerald-400" : "text-red-400"}`}>
            {variance === 0 ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            <span className="font-semibold">{variance === 0 ? "Matches — no variance" : `Variance: ${variance > 0 ? "+" : ""}${fmtBal(variance)}`}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-500/80 disabled:opacity-40 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">
            {saving ? "Saving..." : "Save Count"}
          </button>
        </div>
      </div>
    </div>
  );
}
