"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Plus, Pencil, Trash2, Building2, ChevronDown,
  Download, Save, X, Banknote, Eye, Lock, Unlock, Check, CheckCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import ReminderBell from "@/components/ReminderBell";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */
interface BankAccount {
  id: string;
  bankName: string;
  branch: string;
  acTitle: string;
  accountNo: string;
  iban: string;
  accountType: string;
  branchCode: string;
  notes: string;
  internetBanking: "activated" | "not activated";
  stamp: string;
  signatureAuthority: string;
  mandateHolder: string;
  maintainBalance: string;
  openingBalance: number;
  openingDate: string;
}

interface LedgerRow {
  id: string;
  date: string;
  pdcDate: string;
  ibftNo: string;
  chequeNo: string;
  description: string;
  debit: number | null;
  credit: number | null;
  aa1Tick?: boolean;
  aa1At?: string;
  aa2Tick?: boolean;
  aa2At?: string;
}

interface LedgerData {
  [accountId: string]: LedgerRow[];
}

const STORAGE_KEY_BANKS = "fe_banks";
const STORAGE_KEY_LEDGER = "fe_ledger";

const genId = () => Math.random().toString(36).slice(2, 10);

const fmt = (n: number) =>
  n === 0 ? "0.00" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Stable fingerprints so we sync only the rows that actually changed (per-row),
// instead of overwriting the whole sheet — which let concurrent tabs clobber.
function bankSignature(b: BankAccount): string { return JSON.stringify(b); }
function entrySignature(e: LedgerRow): string {
  return JSON.stringify([e.date, e.pdcDate, e.ibftNo, e.chequeNo, e.description, e.debit, e.credit, e.aa1Tick, e.aa1At, e.aa2Tick, e.aa2At]);
}
// A ledger row with no real content yet — never written to the sheet.
function entryIsBlank(e: LedgerRow): boolean {
  return !e.description?.trim() && e.debit == null && e.credit == null && !e.ibftNo?.trim() && !e.chequeNo?.trim() && !e.pdcDate;
}

const emptyBank = (): BankAccount => ({
  id: genId(),
  bankName: "",
  branch: "",
  acTitle: "",
  accountNo: "",
  iban: "",
  accountType: "",
  branchCode: "",
  notes: "",
  internetBanking: "not activated",
  stamp: "",
  signatureAuthority: "",
  mandateHolder: "",
  maintainBalance: "",
  openingBalance: 0,
  openingDate: new Date().toISOString().slice(0, 10),
});

const emptyRow = (): LedgerRow => ({
  id: genId(),
  date: "",
  pdcDate: "",
  ibftNo: "",
  chequeNo: "",
  description: "",
  debit: null,
  credit: null,
  aa1Tick: false,
  aa1At: "",
  aa2Tick: false,
  aa2At: "",
});

/* ═══════════════════════════════════════════
   PIN / SESSION
   ═══════════════════════════════════════════ */
type Role = "accountant" | "aa1" | "aa2";
interface Session { role: Role; name: string; }

const ROLE_PINS: Record<string, Session> = {
  [process.env.NEXT_PUBLIC_FE_PIN_ACCOUNTANT || ""]: { role: "accountant", name: "A.Hafeez" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA1 || ""]: { role: "aa1", name: "Moiz" },
  [process.env.NEXT_PUBLIC_FE_PIN_AA2 || ""]: { role: "aa2", name: "Hamza" },
};

const SESSION_KEY = "fe_session";

function PinModal({ allowedRoles, onSuccess, onClose }: {
  allowedRoles: Role[];
  onSuccess: (session: Session) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const session = ROLE_PINS[pin.trim()];
    if (!session) { setError("Incorrect PIN."); return; }
    if (!allowedRoles.includes(session.role)) {
      setError(`This action requires ${allowedRoles.map(r => r === "accountant" ? "Accountant" : r.toUpperCase()).join(" or ")} access.`);
      return;
    }
    onSuccess(session);
  }

  const roleLabel = allowedRoles.map(r => r === "accountant" ? "Accountant" : r === "aa1" ? "AA1" : "AA2").join(" / ");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-foreground">Enter PIN</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 ml-auto">{roleLabel}</span>
        </div>
        <input
          type="password"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Enter your PIN"
          autoFocus
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-indigo-500/50 mb-3"
        />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">Confirm</button>
        </div>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
export default function FundEstimatorPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerData>({});
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [showBankModal, setShowBankModal] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [showBankList, setShowBankList] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [summaryFilter, setSummaryFilter] = useState("");
  const [summaryAccFilter, setSummaryAccFilter] = useState("");
  const [summaryTitleFilter, setSummaryTitleFilter] = useState("");
  const [descModal, setDescModal] = useState<string | null>(null);
  const [showFlowReport, setShowFlowReport] = useState(false);
  const [flowDateFrom, setFlowDateFrom] = useState("");
  const [flowDateTo, setFlowDateTo] = useState("");
  const [flowBankFilter, setFlowBankFilter] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [syncError, setSyncError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Signatures of what was last written to each sheet, so we push only changed rows.
  const syncedBanksRef = useRef<Map<string, string>>(new Map());
  const syncedLedgerRef = useRef<Map<string, string>>(new Map());
  const [undoState, setUndoState] = useState<{ row: LedgerRow; accountId: string; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session / PIN
  const [session, setSession] = useState<Session | null>(null);
  const [pinModal, setPinModal] = useState<{ roles: Role[]; action: (s: Session) => void } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) setSession(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function login(s: Session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
    setPinModal(null);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  function requireAuth(roles: Role[], action: (s: Session) => void) {
    if (session && roles.includes(session.role)) {
      action(session);
      return;
    }
    setPinModal({ roles, action });
  }

  // Load from Google Sheets (fall back to localStorage)
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/fund-estimator");
        if (res.ok) {
          const data = await res.json();
          if (data.banks && data.banks.length > 0) {
            const loadedBanks = data.banks as BankAccount[];
            const loadedLedger = data.ledger as LedgerData;
            setBanks(loadedBanks);
            setLedger(loadedLedger);
            // Seed synced-signatures so we don't re-push rows already in the sheet.
            const bSeed = new Map<string, string>();
            for (const b of loadedBanks) bSeed.set(b.id, bankSignature(b));
            syncedBanksRef.current = bSeed;
            const lSeed = new Map<string, string>();
            for (const [accId, rows] of Object.entries(loadedLedger)) {
              for (const r of rows) lSeed.set(`${accId}::${r.id}`, entrySignature(r));
            }
            syncedLedgerRef.current = lSeed;
            setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("fe_sync", new Date().toLocaleTimeString()); } catch {};
            setLoaded(true);
            return;
          }
        }
      } catch { /* API unavailable — fall back to localStorage */ }

      try {
        const b = localStorage.getItem(STORAGE_KEY_BANKS);
        const l = localStorage.getItem(STORAGE_KEY_LEDGER);
        if (b) {
          setBanks(JSON.parse(b));
          if (l) setLedger(JSON.parse(l));
        }
      } catch { /* ignore */ }
      setLoaded(true);
    }
    load();
  }, []);

  // Save to localStorage immediately + debounce sync to Google Sheets
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_BANKS, JSON.stringify(banks));
  }, [banks, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_LEDGER, JSON.stringify(ledger));
  }, [ledger, loaded]);

  // Debounced PER-ROW sync. Diffs banks and ledger against what was last written
  // and pushes only the changed rows (upsert edited/new, delete removed) as
  // targeted single-row operations — so concurrent tabs can't wipe each other.
  const syncToSheets = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const syncedBanks = syncedBanksRef.current;
      const syncedLedger = syncedLedgerRef.current;

      const bankIds = new Set(banks.map((b) => b.id));
      const banksToUpsert = banks.filter((b) => syncedBanks.get(b.id) !== bankSignature(b));
      const banksToDelete = [...syncedBanks.keys()].filter((id) => !bankIds.has(id));

      const ledgerKeys = new Set<string>();
      const entriesToUpsert: { accountId: string; entry: LedgerRow }[] = [];
      for (const [accId, rows] of Object.entries(ledger)) {
        for (const r of rows) {
          const key = `${accId}::${r.id}`;
          ledgerKeys.add(key);
          if (entryIsBlank(r) && !syncedLedger.has(key)) continue;
          if (syncedLedger.get(key) !== entrySignature(r)) entriesToUpsert.push({ accountId: accId, entry: r });
        }
      }
      const entriesToDelete = [...syncedLedger.keys()].filter((k) => !ledgerKeys.has(k));

      if (banksToUpsert.length === 0 && banksToDelete.length === 0 && entriesToUpsert.length === 0 && entriesToDelete.length === 0) return;

      setSyncing(true);
      const post = (payload: unknown) => fetch("/api/fund-estimator", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }).then((r) => { if (!r.ok) throw new Error("sync failed"); });
      try {
        for (const b of banksToUpsert) { await post({ action: "upsert-bank", bank: b }); syncedBanks.set(b.id, bankSignature(b)); }
        for (const id of banksToDelete) { await post({ action: "delete-bank", id }); syncedBanks.delete(id); }
        for (const { accountId, entry } of entriesToUpsert) { await post({ action: "upsert-entry", accountId, entry }); syncedLedger.set(`${accountId}::${entry.id}`, entrySignature(entry)); }
        for (const key of entriesToDelete) { const [accountId, rowId] = key.split("::"); await post({ action: "delete-entry", accountId, rowId }); syncedLedger.delete(key); }
        setLastSync(new Date().toLocaleTimeString()); try { localStorage.setItem("fe_sync", new Date().toLocaleTimeString()); } catch {};
        setSyncError("");
      } catch {
        setSyncError("Network error");
      }
      setSyncing(false);
    }, 1200);
  }, [banks, ledger]);

  useEffect(() => {
    if (!loaded) return;
    syncToSheets();
  }, [banks, ledger, loaded, syncToSheets]);

  // Calculate balance for a row considering PDC
  const calcBalance = useCallback((rows: LedgerRow[], openingBalance: number): number[] => {
    const balances: number[] = [];
    let running = openingBalance;
    for (const row of rows) {
      running += (row.credit ?? 0) - (row.debit ?? 0);
      balances.push(running);
    }
    return balances;
  }, []);

  // Get balance for a bank account
  const getAccountBalance = useCallback((account: BankAccount): number => {
    const rows = ledger[account.id] ?? [];
    if (rows.length === 0) return account.openingBalance;
    const balances = calcBalance(rows, account.openingBalance);
    return balances[balances.length - 1];
  }, [ledger, calcBalance]);

  const selectedAccount = banks.find((b) => b.id === selectedBank) ?? null;
  const currentRows = selectedBank ? (ledger[selectedBank] ?? []) : [];

  function saveBankAccount(bank: BankAccount) {
    if (editingBank && banks.some((b) => b.id === bank.id)) {
      setBanks((prev) => prev.map((b) => (b.id === bank.id ? bank : b)));
    } else {
      setBanks((prev) => [...prev, bank]);
      if (!ledger[bank.id]) {
        setLedger((prev) => ({ ...prev, [bank.id]: [] }));
      }
    }
    setShowBankModal(false);
    setEditingBank(null);
  }

  function deleteBank(id: string) {
    if (!confirm("Delete this bank account and all its ledger data?")) return;
    setBanks((prev) => prev.filter((b) => b.id !== id));
    setLedger((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedBank === id) setSelectedBank("");
  }

  function updateRow(rowId: string, field: keyof LedgerRow, value: string | number | boolean | null) {
    if (!selectedBank) return;
    setLedger((prev) => ({
      ...prev,
      [selectedBank]: (prev[selectedBank] ?? []).map((r) =>
        r.id === rowId ? { ...r, [field]: value } : r
      ),
    }));
  }

  function addRow() {
    if (!selectedBank) return;
    setLedger((prev) => ({
      ...prev,
      [selectedBank]: [...(prev[selectedBank] ?? []), emptyRow()],
    }));
  }

  function deleteRow(rowId: string) {
    if (!selectedBank) return;
    const rows = ledger[selectedBank] ?? [];
    const index = rows.findIndex((r) => r.id === rowId);
    const row = rows[index];
    if (!row) return;

    // Delete immediately
    setLedger((prev) => ({
      ...prev,
      [selectedBank]: (prev[selectedBank] ?? []).filter((r) => r.id !== rowId),
    }));

    // Set up undo for 5 seconds
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoState({ row, accountId: selectedBank, index });
    undoTimer.current = setTimeout(() => setUndoState(null), 5000);
  }

  function undoDelete() {
    if (!undoState) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const { row, accountId, index } = undoState;
    setLedger((prev) => {
      const rows = [...(prev[accountId] ?? [])];
      rows.splice(index, 0, row);
      return { ...prev, [accountId]: rows };
    });
    setUndoState(null);
  }

  function downloadXLS() {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryRows: (string | number)[][] = [
      ["Kafi Groups Bank Balances"],
      ["S.No", "Bank", "Account Details", "Balance"],
      ...banks.map((b, i) => [i + 1, b.bankName, `${b.acTitle} - ${b.accountType}`, getAccountBalance(b)]),
      ["", "", "TOTAL", banks.reduce((s, b) => s + getAccountBalance(b), 0)],
    ];
    const ws0 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws0["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 40 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws0, "ALL ACCOUNTS SUMMARY");

    // Each bank account as a sheet
    for (const bank of banks) {
      const rows = ledger[bank.id] ?? [];
      const balances = calcBalance(rows, bank.openingBalance);
      const sheetRows: (string | number)[][] = [
        [bank.bankName, "", "", "", "BRANCH", bank.branch, "", "", "Notes", ""],
        ["A/C Title:", bank.acTitle, "", "", "", "", "", "", "Internet Banking", bank.internetBanking],
        ["Account No.", bank.accountNo, "", "", "Opening Balance Date:", "", bank.openingDate, "", "Stamp", bank.stamp],
        ["IBAN #", bank.iban, "", "", "Opening Balance", "", bank.openingBalance, "", "Signature Authority", bank.signatureAuthority],
        ["Account Type", bank.accountType, "", "", "Debit", "Credit", "Balance", "", "Mandate Holder", bank.mandateHolder],
        ["Branch Number", bank.branchCode, "", "", rows.reduce((s, r) => s + (r.debit ?? 0), 0), rows.reduce((s, r) => s + (r.credit ?? 0), 0), balances.length > 0 ? balances[balances.length - 1] : bank.openingBalance, "", "Maintain Balance", bank.maintainBalance],
        ["DATE", "PDC DATE", "IBFT #", "CHQ NO.", "DESCRIPTION", "DEBIT", "CREDIT", "BALANCE", ""],
        ...rows.map((r, i) => [r.date, r.pdcDate, r.ibftNo ?? "", r.chequeNo, r.description, r.debit ?? "", r.credit ?? "", balances[i], ""]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 2 }, { wch: 20 }, { wch: 25 }];
      const sheetName = `${bank.bankName}-${bank.accountNo}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    XLSX.writeFile(wb, "Fund-Estimated-Sheet.xlsx");
  }

  if (!loaded) return null;

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <Banknote className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Fund Estimation Work Space</span>
        <div className="ml-auto flex items-center gap-3">
          {session && (
            <div className="flex items-center gap-2">
              <ReminderBell role={session.role} name={session.name} />
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold">
                {session.role === "accountant" ? "Accountant" : session.role === "aa1" ? "AA1" : "AA2"}: {session.name}
              </span>
              <button onClick={logout} className="text-[10px] text-muted hover:text-red-400 cursor-pointer transition-colors">
                Logout
              </button>
            </div>
          )}
          {banks.length > 0 && (
            <button onClick={downloadXLS} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-500/80 text-white rounded-lg cursor-pointer transition-colors">
              <Download className="w-3 h-3" /> Export XLS
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

          {/* Bank Management Bar */}
          <div className="bg-surface rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowBankList(v => !v)}
                className="flex items-center gap-2 cursor-pointer group"
              >
                <Building2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Bank Accounts
                  {banks.length > 0 && <span className="ml-1.5 text-indigo-400">({banks.length})</span>}
                </h3>
                <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform ${showBankList ? "rotate-180" : ""}`} />
              </button>
              <button
                onClick={() => requireAuth(["accountant"], () => { setEditingBank(null); setShowBankModal(true); })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-500/80 text-white rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Bank
              </button>
            </div>
            {showBankList && (
              <>
            {banks.length === 0 ? (
              <p className="text-sm text-muted text-center py-6 mt-3">No bank accounts added yet. Click &quot;Add Bank&quot; to get started.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {banks.map((bank) => (
                  <div
                    key={bank.id}
                    onClick={() => { setSelectedBank(bank.id); setShowSummary(false); setEditMode(false); }}
                    className={`relative group p-3 rounded-xl border cursor-pointer transition-all ${
                      selectedBank === bank.id
                        ? "border-indigo-500/60 bg-indigo-500/5"
                        : "border-border hover:border-indigo-500/30 bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="text-xs font-semibold text-foreground truncate">{bank.bankName}</span>
                        </div>
                        <p className="text-[10px] text-muted mt-1 truncate">{bank.acTitle}</p>
                        <p className="text-[10px] text-muted truncate">{bank.accountNo} &middot; {bank.accountType}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-foreground">{fmt(getAccountBalance(bank))}</p>
                        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); requireAuth(["accountant"], () => { setEditingBank(bank); setShowBankModal(true); }); }}
                            className="p-1 text-muted hover:text-indigo-400 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); requireAuth(["accountant"], () => deleteBank(bank.id)); }}
                            className="p-1 text-muted hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </>
            )}
          </div>

          {/* Summary Dashboard */}
          {banks.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <button
                onClick={() => { setShowSummary(!showSummary); setSelectedBank(""); }}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-foreground">
                    All Accounts Summary
                    <span className="ml-2 text-xs font-normal text-muted">({banks.length} accounts)</span>
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-indigo-400">{fmt(banks.reduce((s, b) => s + getAccountBalance(b), 0))}</span>
                  <ChevronDown className={`w-4 h-4 text-muted transition-transform ${showSummary ? "rotate-180" : ""}`} />
                </div>
              </button>
              {showSummary && (() => {
                const uniqueBanks = [...new Set(banks.map(b => b.bankName))].sort();
                const filteredBanks = banks.filter(b => {
                  const matchBank  = !summaryFilter || b.bankName === summaryFilter;
                  const matchAcc   = !summaryAccFilter || b.accountNo === summaryAccFilter;
                  const matchTitle = !summaryTitleFilter || b.acTitle === summaryTitleFilter;
                  return matchBank && matchAcc && matchTitle;
                });
                const uniqueTitles = [...new Set(banks.map(b => b.acTitle).filter(Boolean))].sort();
                return (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={summaryFilter}
                        onChange={e => setSummaryFilter(e.target.value)}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                      >
                        <option value="">All Banks</option>
                        {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <select
                        value={summaryAccFilter}
                        onChange={e => setSummaryAccFilter(e.target.value)}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                      >
                        <option value="">All Accounts</option>
                        {banks.filter(b => b.accountNo).map(b => (
                          <option key={b.id} value={b.accountNo}>{b.accountNo} — {b.bankName}</option>
                        ))}
                      </select>
                      <select
                        value={summaryTitleFilter}
                        onChange={e => setSummaryTitleFilter(e.target.value)}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                      >
                        <option value="">All Account Titles</option>
                        {uniqueTitles.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {(summaryFilter || summaryAccFilter || summaryTitleFilter) && (
                        <button onClick={() => { setSummaryFilter(""); setSummaryAccFilter(""); setSummaryTitleFilter(""); }} className="text-[10px] text-muted hover:text-foreground cursor-pointer">Clear</button>
                      )}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-indigo-500/10 text-indigo-400">
                          <th className="px-3 py-2.5 text-left font-semibold w-[40px]">S.No</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Bank</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Account Details</th>
                          <th className="px-3 py-2.5 text-left font-semibold w-[160px]">Account No.</th>
                          <th className="px-3 py-2.5 text-right font-semibold w-[140px]">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBanks.map((bank, i) => (
                          <tr key={bank.id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-foreground">{bank.bankName}</td>
                            <td className="px-3 py-2 text-foreground">{bank.acTitle} &middot; {bank.accountType}</td>
                            <td className="px-3 py-2 font-mono text-muted">{bank.accountNo || "—"}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{fmt(getAccountBalance(bank))}</td>
                          </tr>
                        ))}
                        <tr className="bg-indigo-500/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5" colSpan={5}>{summaryFilter || summaryAccFilter || summaryTitleFilter ? "TOTAL (filtered)" : "TOTAL"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-indigo-400">{fmt(filteredBanks.reduce((s, b) => s + getAccountBalance(b), 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Debit / Credit Flow Report */}
          {banks.length > 0 && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              <button
                onClick={() => setShowFlowReport(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${showFlowReport ? "rotate-180" : ""}`} />
                  <h3 className="text-sm font-semibold text-foreground">Transaction Flow Report
                    <span className="ml-2 text-xs font-normal text-muted">— debit & credit summary by date / bank</span>
                  </h3>
                </div>
              </button>

              {showFlowReport && (() => {
                const allEntries = banks
                  .filter(b => !flowBankFilter || b.id === flowBankFilter)
                  .flatMap(b =>
                    (ledger[b.id] ?? [])
                      .filter(r =>
                        (!flowDateFrom || r.date >= flowDateFrom) &&
                        (!flowDateTo   || r.date <= flowDateTo)
                      )
                      .map(r => ({ ...r, bankName: b.bankName, accountNo: b.accountNo, acTitle: b.acTitle }))
                  )
                  .sort((a, b) => a.date.localeCompare(b.date));

                const debitRows  = allEntries.filter(e => e.debit  !== null && (e.debit  ?? 0) > 0);
                const creditRows = allEntries.filter(e => e.credit !== null && (e.credit ?? 0) > 0);
                const totalDebit  = debitRows.reduce((s, e)  => s + (e.debit  ?? 0), 0);
                const totalCredit = creditRows.reduce((s, e) => s + (e.credit ?? 0), 0);

                const TxnTable = ({ rows, type }: { rows: typeof allEntries; type: "debit" | "credit" }) => (
                  <div>
                    <h4 className={`text-xs font-bold uppercase tracking-wide mb-2 ${type === "debit" ? "text-red-400" : "text-emerald-400"}`}>
                      {type === "debit" ? "Cash Out (Debits)" : "Cash In (Credits)"} — {rows.length} transactions
                    </h4>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={type === "debit" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}>
                            <th className="px-3 py-2 text-left font-semibold w-[36px]">#</th>
                            <th className="px-3 py-2 text-left font-semibold w-[100px]">Date</th>
                            <th className="px-3 py-2 text-left font-semibold w-[130px]">Bank</th>
                            <th className="px-3 py-2 text-left font-semibold">Description</th>
                            <th className="px-3 py-2 text-right font-semibold w-[130px]">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">No {type} transactions in this period.</td></tr>
                          ) : rows.map((r, i) => (
                            <tr key={r.id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                              <td className="px-3 py-2 text-muted">{i + 1}</td>
                              <td className="px-3 py-2 text-muted">{r.date || "—"}</td>
                              <td className="px-3 py-2 text-foreground">{r.bankName}</td>
                              <td className="px-3 py-2 text-muted truncate max-w-[250px]">
                                <button onClick={() => r.description && setDescModal(r.description)}
                                  className={r.description ? "hover:text-indigo-400 cursor-pointer text-left truncate w-full" : "cursor-default text-muted/40"}>
                                  {r.description || "—"}
                                </button>
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${type === "debit" ? "text-red-400" : "text-emerald-400"}`}>
                                {fmt(type === "debit" ? (r.debit ?? 0) : (r.credit ?? 0))}
                              </td>
                            </tr>
                          ))}
                          <tr className={`border-t border-border font-bold ${type === "debit" ? "bg-red-500/5" : "bg-emerald-500/5"}`}>
                            <td colSpan={4} className="px-3 py-2.5 text-right">TOTAL</td>
                            <td className={`px-3 py-2.5 text-right font-mono ${type === "debit" ? "text-red-400" : "text-emerald-400"}`}>
                              {fmt(type === "debit" ? totalDebit : totalCredit)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );

                return (
                  <div className="px-5 pb-5 space-y-5">
                    {/* Filters */}
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      <select value={flowBankFilter} onChange={e => setFlowBankFilter(e.target.value)}
                        className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                        <option value="">All Banks</option>
                        {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} — {b.acTitle}{b.accountNo ? ` (${b.accountNo})` : ""}</option>)}
                      </select>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">From</span>
                        <input type="date" value={flowDateFrom} onChange={e => setFlowDateFrom(e.target.value)}
                          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">To</span>
                        <input type="date" value={flowDateTo} onChange={e => setFlowDateTo(e.target.value)}
                          className="text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer" />
                      </div>
                      {(flowBankFilter || flowDateFrom || flowDateTo) && (
                        <button onClick={() => { setFlowBankFilter(""); setFlowDateFrom(""); setFlowDateTo(""); }}
                          className="text-[10px] text-muted hover:text-foreground cursor-pointer">Clear</button>
                      )}
                      <div className="ml-auto flex items-center gap-4 text-xs font-semibold">
                        <span className="text-red-400">Total Out: {fmt(totalDebit)}</span>
                        <span className="text-emerald-400">Total In: {fmt(totalCredit)}</span>
                        <span className={`${totalCredit - totalDebit >= 0 ? "text-indigo-400" : "text-red-400"}`}>
                          Net: {fmt(Math.abs(totalCredit - totalDebit))} {totalCredit - totalDebit >= 0 ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* Tables — Credit first, then Debit */}
                    <TxnTable rows={creditRows} type="credit" />
                    <TxnTable rows={debitRows}  type="debit"  />
                  </div>
                );
              })()}
            </div>
          )}

          {/* Ledger Editor */}
          {selectedAccount && (
            <div className="bg-surface rounded-2xl border border-border overflow-hidden">
              {/* Account Header */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{selectedAccount.bankName} &mdash; {selectedAccount.branch}</h3>
                    <p className="text-xs text-muted mt-0.5">{selectedAccount.acTitle} &middot; {selectedAccount.accountNo} &middot; {selectedAccount.accountType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted uppercase tracking-wide">Current Balance</p>
                    <p className="text-lg font-bold text-indigo-400">{fmt(getAccountBalance(selectedAccount))}</p>
                  </div>
                </div>
                {/* Account meta row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-border/50">
                  <div><span className="text-[10px] text-muted block">Opening Balance</span><span className="text-xs font-semibold text-foreground">{fmt(selectedAccount.openingBalance)}</span></div>
                  <div><span className="text-[10px] text-muted block">Opening Date</span><span className="text-xs font-semibold text-foreground">{selectedAccount.openingDate}</span></div>
                  <div><span className="text-[10px] text-muted block">IBAN</span><span className="text-xs font-semibold text-foreground truncate block">{selectedAccount.iban}</span></div>
                  <div><span className="text-[10px] text-muted block">Signature Authority</span><span className="text-xs font-semibold text-foreground">{selectedAccount.signatureAuthority || "—"}</span></div>
                </div>
              </div>

              {/* Edit Toggle */}
              <div className="px-5 py-2.5 border-b border-border/50 flex items-center justify-between">
                <button
                  onClick={() => {
                    if (editMode) { setEditMode(false); return; }
                    requireAuth(["accountant", "aa1", "aa2"], () => setEditMode(true));
                  }}
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

              {/* Ledger Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-indigo-500/10 text-indigo-400">
                      <th className="px-2 py-2.5 text-left font-semibold w-[36px]">#</th>
                      <th className="px-2 py-2.5 text-left font-semibold w-[110px]">Date</th>
                      <th className="px-2 py-2.5 text-left font-semibold w-[110px]">PDC Date</th>
                      <th className="px-2 py-2.5 text-left font-semibold w-[115px]">IBFT #</th>
                      <th className="px-2 py-2.5 text-left font-semibold w-[100px]">Cheque No.</th>
                      <th className="px-2 py-2.5 text-left font-semibold max-w-[220px]">Description</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Debit</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Credit</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[130px]">Balance</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[50px]" title="Assistant Accountant 1 — Recorded in physical diary">AA1</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-[50px]" title="Assistant Accountant 2 — Verified physical diary entry">AA2</th>
                      <th className="px-2 py-2.5 text-center w-[36px]">{editMode && <Trash2 className="w-3 h-3 text-muted mx-auto" />}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-muted">No entries yet. Click &quot;Add Row&quot; to start.</td>
                      </tr>
                    )}
                    {currentRows.map((row, i) => {
                      const balances = calcBalance(currentRows, selectedAccount.openingBalance);
                      const balance = balances[i];
                      const hasPdc = !!row.pdcDate;
                      return (
                        <tr key={row.id} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"}`}>
                          <td className="px-2 py-1.5 text-muted">{i + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) => updateRow(row.id, "date", e.target.value)}
                              disabled={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="date"
                              value={row.pdcDate}
                              onChange={(e) => updateRow(row.id, "pdcDate", e.target.value)}
                              disabled={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.ibftNo}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^a-zA-Z0-9\s\-/#]/g, "");
                                updateRow(row.id, "ibftNo", v);
                              }}
                              placeholder="—"
                              readOnly={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.chequeNo}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, "");
                                updateRow(row.id, "chequeNo", v);
                              }}
                              placeholder="—"
                              readOnly={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 max-w-[220px]">
                            {editMode ? (
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^a-zA-Z0-9\s\-/.#&(),@:;'"+=$%!]/g, "");
                                  updateRow(row.id, "description", v);
                                }}
                                placeholder="Enter description..."
                                className="w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs border border-transparent hover:border-border focus:border-indigo-500/50"
                              />
                            ) : (
                              <button
                                onClick={() => row.description && setDescModal(row.description)}
                                className={`w-full text-left px-1.5 py-1 text-xs truncate block ${row.description ? "text-foreground hover:text-indigo-400 cursor-pointer" : "text-muted/40 cursor-default"}`}
                                title={row.description || ""}
                              >
                                {row.description || ""}
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.debit === null ? "" : row.debit}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                updateRow(row.id, "debit", v === "" ? null : parseFloat(v) || 0);
                              }}
                              placeholder={editMode ? "—" : ""}
                              readOnly={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-right text-red-400 font-mono focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.credit === null ? "" : row.credit}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                updateRow(row.id, "credit", v === "" ? null : parseFloat(v) || 0);
                              }}
                              placeholder={editMode ? "—" : ""}
                              readOnly={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-right text-emerald-400 font-mono focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono font-semibold ${balance < 0 ? "text-red-400" : "text-foreground"}`}>
                            {fmt(balance)}
                            {hasPdc && (
                              <button
                                onClick={() => requireAuth(["accountant"], () => {
                                  if (confirm("Confirm this post-dated cheque has cleared at the bank?\n\nThis removes the PDC flag and drops it from the PDC reminder note. The transaction itself stays in the ledger.")) {
                                    updateRow(row.id, "pdcDate", "");
                                  }
                                })}
                                title="Cheque deposited/cleared? Click to remove the PDC flag"
                                className="text-[9px] text-red-400 hover:text-emerald-400 underline decoration-dotted cursor-pointer block w-full text-right"
                              >
                                PDC ✓
                              </button>
                            )}
                          </td>
                          {/* AA1 — tick for credit or IBFT entries */}
                          <td className="px-2 py-1.5 text-center">
                            {(row.credit !== null && row.credit > 0) || row.ibftNo ? (
                              row.aa1Tick ? (
                                <button
                                  onClick={() => requireAuth(["accountant"], () => {
                                    updateRow(row.id, "aa1Tick", false);
                                    updateRow(row.id, "aa1At", "");
                                    updateRow(row.id, "aa2Tick", false);
                                    updateRow(row.id, "aa2At", "");
                                  })}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/20 hover:bg-red-500/20 group cursor-pointer transition-colors"
                                  title={`Recorded by AA1${row.aa1At ? ` on ${new Date(row.aa1At).toLocaleString()}` : ""} — Accountant can untick`}
                                >
                                  <Check className="w-3 h-3 text-emerald-400 group-hover:hidden" />
                                  <X className="w-3 h-3 text-red-400 hidden group-hover:block" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => requireAuth(["aa1", "accountant"], () => {
                                    updateRow(row.id, "aa1Tick", true);
                                    updateRow(row.id, "aa1At", new Date().toISOString());
                                  })}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded border border-dashed border-amber-400/50 hover:border-amber-400 hover:bg-amber-500/10 cursor-pointer transition-colors"
                                  title="Click to confirm entry recorded in physical diary"
                                >
                                  <span className="text-[9px] text-amber-400">&#x2713;</span>
                                </button>
                              )
                            ) : null}
                          </td>
                          {/* AA2 — verify AA1's tick */}
                          <td className="px-2 py-1.5 text-center">
                            {row.aa1Tick ? (
                              row.aa2Tick ? (
                                <button
                                  onClick={() => requireAuth(["accountant"], () => {
                                    updateRow(row.id, "aa2Tick", false);
                                    updateRow(row.id, "aa2At", "");
                                  })}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-500/20 hover:bg-red-500/20 group cursor-pointer transition-colors"
                                  title={`Verified by AA2${row.aa2At ? ` on ${new Date(row.aa2At).toLocaleString()}` : ""} — Accountant can untick`}
                                >
                                  <CheckCheck className="w-3 h-3 text-blue-400 group-hover:hidden" />
                                  <X className="w-3 h-3 text-red-400 hidden group-hover:block" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => requireAuth(["aa2", "accountant"], () => {
                                    updateRow(row.id, "aa2Tick", true);
                                    updateRow(row.id, "aa2At", new Date().toISOString());
                                  })}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded border border-dashed border-blue-400/50 hover:border-blue-400 hover:bg-blue-500/10 cursor-pointer transition-colors"
                                  title="Click to confirm physical diary entry verified"
                                >
                                  <span className="text-[9px] text-blue-400">&#x2713;</span>
                                </button>
                              )
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5">
                            {editMode && (
                              <button onClick={() => requireAuth(["accountant", "aa1", "aa2"], () => deleteRow(row.id))} className="p-1 text-muted hover:text-red-400 cursor-pointer transition-colors">
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
              {currentRows.length > 0 && (
                <div className="px-5 py-3 border-t border-border bg-indigo-500/5 flex items-center justify-between text-xs">
                  <span className="text-muted font-semibold">{currentRows.length} entries</span>
                  <div className="flex items-center gap-6">
                    <span className="text-red-400 font-mono font-semibold">DR: {fmt(currentRows.reduce((s, r) => s + (r.debit ?? 0), 0))}</span>
                    <span className="text-emerald-400 font-mono font-semibold">CR: {fmt(currentRows.reduce((s, r) => s + (r.credit ?? 0), 0))}</span>
                    <span className="text-indigo-400 font-mono font-bold">BAL: {fmt(getAccountBalance(selectedAccount))}</span>
                  </div>
                </div>
              )}

              {/* PDC Note */}
              {(() => {
                const pdcRows = currentRows.filter((r) => r.pdcDate);
                if (pdcRows.length === 0) return null;
                return (
                  <div className="px-5 py-3 border-t border-border bg-red-500/5">
                    <p className="text-xs text-black font-semibold mb-1.5">Please note the PDC cheques issued:</p>
                    {pdcRows.map((r, i) => (
                      <p key={r.id} className="text-xs text-black font-mono ml-2">
                        #{i + 1} {r.chequeNo ? `Cheque #${r.chequeNo}` : "—"} &nbsp;·&nbsp; Amount = {fmt(r.debit ?? r.credit ?? 0)} &nbsp;·&nbsp; PDC Date: {r.pdcDate} &nbsp;·&nbsp; {r.description}
                      </p>
                    ))}
                  </div>
                );
              })()}

              {/* Add Row */}
              {editMode && (
                <div className="px-5 py-3 border-t border-border">
                  <button onClick={() => requireAuth(["accountant", "aa1", "aa2"], addRow)} className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Undo toast */}
      {undoState && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3 shadow-xl animate-fade-in">
          <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-sm text-foreground">Row deleted</span>
          <button
            onClick={undoDelete}
            className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <PinModal
          allowedRoles={pinModal.roles}
          onSuccess={(s) => { login(s); pinModal.action(s); }}
          onClose={() => setPinModal(null)}
        />
      )}


      {/* Description full-text modal */}
      {descModal !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl border border-border max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Description</h3>
              <button onClick={() => setDescModal(null)} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{descModal}</p>
          </div>
        </div>
      )}

      {/* Bank Account Modal */}
      {showBankModal && (
        <BankModal
          bank={editingBank ?? emptyBank()}
          isEdit={!!editingBank}
          onSave={saveBankAccount}
          onClose={() => { setShowBankModal(false); setEditingBank(null); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   BANK MODAL
   ═══════════════════════════════════════════ */

// Defined outside BankModal so React never remounts it on re-render (fixes focus-loss on keypress)
function BankField({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50"
      />
    </div>
  );
}

function BankModal({ bank, isEdit, onSave, onClose }: { bank: BankAccount; isEdit: boolean; onSave: (b: BankAccount) => void; onClose: () => void }) {
  const [form, setForm] = useState<BankAccount>(bank);

  function set<K extends keyof BankAccount>(key: K, value: BankAccount[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!form.bankName.trim() || !form.acTitle.trim()) {
      alert("Bank Name and A/C Title are required.");
      return;
    }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{isEdit ? "Edit" : "Add"} Bank Account</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-auto p-5 space-y-5">
          {/* Primary Details */}
          <div>
            <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-3">Account Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <BankField label="Bank Name" value={form.bankName} onChange={(v) => set("bankName", v)} placeholder="e.g. SONERI BANK" required />
              <BankField label="Branch" value={form.branch} onChange={(v) => set("branch", v)} placeholder="e.g. CLIFTON BLOCK-8" />
              <BankField label="A/C Title" value={form.acTitle} onChange={(v) => set("acTitle", v)} placeholder="e.g. KAFI COMMODITIES (PVT.) LTD" required />
              <BankField label="Account Number" value={form.accountNo} onChange={(v) => set("accountNo", v)} placeholder="e.g. 0268-20011926747" />
              <BankField label="IBAN #" value={form.iban} onChange={(v) => set("iban", v)} placeholder="e.g. PK70SONE0026820011926747" />
              <BankField label="Account Type" value={form.accountType} onChange={(v) => set("accountType", v)} placeholder="e.g. SAVING ACCOUNT" />
              <BankField label="Branch Code" value={form.branchCode} onChange={(v) => set("branchCode", v)} placeholder="e.g. CODE 0268" />
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Opening Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.openingBalance}
                  onChange={(e) => set("openingBalance", parseFloat(e.target.value) || 0)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Opening Balance Date</label>
                <input
                  type="date"
                  value={form.openingDate}
                  onChange={(e) => set("openingDate", e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>
          </div>

          {/* Sub Details */}
          <div>
            <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-3">Sub Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <BankField label="Notes" value={form.notes} onChange={(v) => set("notes", v)} placeholder="Notes..." />
              <div>
                <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">Internet Banking</label>
                <select
                  value={form.internetBanking}
                  onChange={(e) => set("internetBanking", e.target.value as "activated" | "not activated")}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                >
                  <option value="not activated">Not Activated</option>
                  <option value="activated">Activated</option>
                </select>
              </div>
              <BankField label="Stamp" value={form.stamp} onChange={(v) => set("stamp", v)} placeholder="e.g. Round Stamp Kafi" />
              <BankField label="Signature Authority" value={form.signatureAuthority} onChange={(v) => set("signatureAuthority", v)} placeholder="e.g. SKP & KMP" />
              <BankField label="Mandate Holder" value={form.mandateHolder} onChange={(v) => set("mandateHolder", v)} placeholder="Enter if applicable" />
              <BankField label="Maintain Balance" value={form.maintainBalance} onChange={(v) => set("maintainBalance", v)} placeholder="Enter if applicable" />
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-5 py-2 bg-indigo-500 hover:bg-indigo-500/80 text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors">
            <Save className="w-3.5 h-3.5" /> {isEdit ? "Update" : "Add Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
