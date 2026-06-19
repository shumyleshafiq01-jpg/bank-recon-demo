"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, Plus, Pencil, Trash2, Building2, ChevronDown,
  Download, Save, X, Banknote, Eye, Lock, Unlock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

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
  chequeNo: string;
  description: string;
  debit: number | null;
  credit: number | null;
}

interface LedgerData {
  [accountId: string]: LedgerRow[];
}

const STORAGE_KEY_BANKS = "fe_banks";
const STORAGE_KEY_LEDGER = "fe_ledger";

const genId = () => Math.random().toString(36).slice(2, 10);

const fmt = (n: number) =>
  n === 0 ? "0.00" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  chequeNo: "",
  description: "",
  debit: null,
  credit: null,
});

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
  const [showSummary, setShowSummary] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage (seed demo data if empty)
  useEffect(() => {
    try {
      const b = localStorage.getItem(STORAGE_KEY_BANKS);
      const l = localStorage.getItem(STORAGE_KEY_LEDGER);
      if (b) {
        setBanks(JSON.parse(b));
        if (l) setLedger(JSON.parse(l));
      } else {
        const demo1: BankAccount = {
          id: "demo_soneri_sav", bankName: "SONERI BANK", branch: "CLIFTON BLOCK-8",
          acTitle: "KAFI COMMODITIES (PVT.) LIMITED", accountNo: "0268-20011926747",
          iban: "PK70SONE0026820011926747", accountType: "SAVING ACCOUNT", branchCode: "CODE 0268",
          notes: "", internetBanking: "not activated", stamp: "Round Stamp Kafi",
          signatureAuthority: "SKP & KMP", mandateHolder: "", maintainBalance: "",
          openingBalance: 50000, openingDate: "2026-06-01",
        };
        const demo2: BankAccount = {
          id: "demo_hmb_curr", bankName: "HABIB METROPOLITAN BANK", branch: "City Court",
          acTitle: "KAFI KITCHEN", accountNo: "PK23MPBL0158217140156030",
          iban: "PK23MPBL0158217140156030", accountType: "PLS CURRENT", branchCode: "",
          notes: "", internetBanking: "activated", stamp: "Kafi Kitchen Proprietor Stamp",
          signatureAuthority: "SKP", mandateHolder: "", maintainBalance: "",
          openingBalance: 29314, openingDate: "2026-06-01",
        };
        const demoLedger: LedgerData = {
          demo_soneri_sav: [
            { id: "s1", date: "2026-06-02", pdcDate: "", chequeNo: "", description: "Profit from 01-Jun to 30-Jun-2026", debit: null, credit: 1250 },
            { id: "s2", date: "2026-06-02", pdcDate: "", chequeNo: "", description: "15% W/H Tax Deducted", debit: 188, credit: null },
            { id: "s3", date: "2026-06-05", pdcDate: "", chequeNo: "101001", description: "Cash Cheque Issued to Vendor - Office Supplies", debit: 15000, credit: null },
            { id: "s4", date: "2026-06-10", pdcDate: "", chequeNo: "", description: "IBFT Received from HMB-156030 Fund Transfer", debit: null, credit: 200000 },
            { id: "s5", date: "2026-06-12", pdcDate: "2026-07-01", chequeNo: "101002", description: "PDC Cheque to Allied Logistics - Freight Charges Export Inv #2050", debit: 85000, credit: null },
            { id: "s6", date: "2026-06-15", pdcDate: "", chequeNo: "", description: "Standing Instruction Transfer from HMB-155861", debit: null, credit: 350000 },
          ],
          demo_hmb_curr: [
            { id: "h1", date: "2026-06-01", pdcDate: "", chequeNo: "", description: "Export Remittance FBDC #1620050 USD 18,500 @ 280", debit: null, credit: 5180000 },
            { id: "h2", date: "2026-06-01", pdcDate: "", chequeNo: "", description: "Bank Charges against Export Invoice KAFI-2050", debit: 62000, credit: null },
            { id: "h3", date: "2026-06-03", pdcDate: "", chequeNo: "102001650", description: "Fund Transfer to SONERI SAVING Kafi Commodities A/c", debit: 200000, credit: null },
            { id: "h4", date: "2026-06-05", pdcDate: "", chequeNo: "", description: "Sindh Sales Tax on Service", debit: 10, credit: null },
            { id: "h5", date: "2026-06-05", pdcDate: "", chequeNo: "", description: "SOC - GSM Subscription Charges Monthly", debit: 75, credit: null },
            { id: "h6", date: "2026-06-08", pdcDate: "", chequeNo: "102001651", description: "Cash Cheque to Petty Cash - Office Use", debit: 50000, credit: null },
            { id: "h7", date: "2026-06-10", pdcDate: "", chequeNo: "102001652", description: "Fund Transfer to HMB-156107 Kafi Commodities for Cement Purchase", debit: 1500000, credit: null },
          ],
        };
        setBanks([demo1, demo2]);
        setLedger(demoLedger);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_BANKS, JSON.stringify(banks));
  }, [banks, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY_LEDGER, JSON.stringify(ledger));
  }, [ledger, loaded]);

  // Calculate balance for a row considering PDC
  const calcBalance = useCallback((rows: LedgerRow[], openingBalance: number): number[] => {
    const balances: number[] = [];
    let running = openingBalance;
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      const isPdcFuture = row.pdcDate && row.pdcDate > today;
      if (!isPdcFuture) {
        running += (row.credit ?? 0) - (row.debit ?? 0);
      }
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

  function updateRow(rowId: string, field: keyof LedgerRow, value: string | number | null) {
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
    setLedger((prev) => ({
      ...prev,
      [selectedBank]: (prev[selectedBank] ?? []).filter((r) => r.id !== rowId),
    }));
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
        ["DATE", "PDC DATE", "CHQ NO.", "DESCRIPTION", "DEBIT", "CREDIT", "BALANCE", ""],
        ...rows.map((r, i) => [r.date, r.pdcDate, r.chequeNo, r.description, r.debit ?? "", r.credit ?? "", balances[i], ""]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 2 }, { wch: 20 }, { wch: 25 }];
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
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold">WIP</span>
        <div className="ml-auto flex items-center gap-2">
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Bank Accounts</h3>
              <button
                onClick={() => { setEditingBank(null); setShowBankModal(true); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-indigo-500 hover:bg-indigo-500/80 text-white rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Bank
              </button>
            </div>
            {banks.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No bank accounts added yet. Click &quot;Add Bank&quot; to get started.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                            onClick={(e) => { e.stopPropagation(); setEditingBank(bank); setShowBankModal(true); }}
                            className="p-1 text-muted hover:text-indigo-400 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteBank(bank.id); }}
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
              {showSummary && (
                <div className="px-5 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-indigo-500/10 text-indigo-400">
                        <th className="px-3 py-2.5 text-left font-semibold w-[40px]">S.No</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Bank</th>
                        <th className="px-3 py-2.5 text-left font-semibold">Account Details</th>
                        <th className="px-3 py-2.5 text-right font-semibold w-[140px]">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {banks.map((bank, i) => (
                        <tr key={bank.id} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                          <td className="px-3 py-2 text-muted">{i + 1}</td>
                          <td className="px-3 py-2 text-foreground">{bank.bankName}</td>
                          <td className="px-3 py-2 text-foreground">{bank.acTitle} &middot; {bank.accountType}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">{fmt(getAccountBalance(bank))}</td>
                        </tr>
                      ))}
                      <tr className="bg-indigo-500/5 font-semibold border-t border-border">
                        <td className="px-3 py-2.5" colSpan={3}>TOTAL</td>
                        <td className="px-3 py-2.5 text-right font-mono text-indigo-400">{fmt(banks.reduce((s, b) => s + getAccountBalance(b), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
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
                  onClick={() => setEditMode(!editMode)}
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
                      <th className="px-2 py-2.5 text-left font-semibold w-[100px]">Cheque No.</th>
                      <th className="px-2 py-2.5 text-left font-semibold">Description</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Debit</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[120px]">Credit</th>
                      <th className="px-2 py-2.5 text-right font-semibold w-[130px]">Balance</th>
                      <th className="px-2 py-2.5 w-[36px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted">No entries yet. Click &quot;Add Row&quot; to start.</td>
                      </tr>
                    )}
                    {currentRows.map((row, i) => {
                      const balances = calcBalance(currentRows, selectedAccount.openingBalance);
                      const balance = balances[i];
                      const isPdcFuture = row.pdcDate && row.pdcDate > new Date().toISOString().slice(0, 10);
                      return (
                        <tr key={row.id} className={`${i % 2 === 0 ? "" : "bg-surface-light/20"} ${isPdcFuture ? "opacity-60" : ""}`}>
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
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^a-zA-Z0-9\s\-/.#&(),@:;'"+=$%!]/g, "");
                                updateRow(row.id, "description", v);
                              }}
                              placeholder={editMode ? "Enter description..." : ""}
                              readOnly={!editMode}
                              className={`w-full bg-transparent rounded px-1.5 py-1 text-foreground focus:outline-none text-xs ${editMode ? "border border-transparent hover:border-border focus:border-indigo-500/50" : "border border-transparent cursor-default"}`}
                            />
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
                            {isPdcFuture && <span className="text-[9px] text-amber-400 block">PDC</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {editMode && (
                              <button onClick={() => deleteRow(row.id)} className="p-1 text-muted hover:text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
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

              {/* Add Row */}
              {editMode && (
                <div className="px-5 py-3 border-t border-border">
                  <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors">
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

  const Field = ({ label, field, placeholder, required }: { label: string; field: keyof BankAccount; placeholder?: string; required?: boolean }) => (
    <div>
      <label className="text-[10px] text-muted uppercase tracking-wide block mb-1">{label}{required && <span className="text-red-400">*</span>}</label>
      <input
        type="text"
        value={String(form[field])}
        onChange={(e) => set(field, e.target.value as never)}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/50"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
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
              <Field label="Bank Name" field="bankName" placeholder="e.g. SONERI BANK" required />
              <Field label="Branch" field="branch" placeholder="e.g. CLIFTON BLOCK-8" />
              <Field label="A/C Title" field="acTitle" placeholder="e.g. KAFI COMMODITIES (PVT.) LTD" required />
              <Field label="Account Number" field="accountNo" placeholder="e.g. 0268-20011926747" />
              <Field label="IBAN #" field="iban" placeholder="e.g. PK70SONE0026820011926747" />
              <Field label="Account Type" field="accountType" placeholder="e.g. SAVING ACCOUNT" />
              <Field label="Branch Code" field="branchCode" placeholder="e.g. CODE 0268" />
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
              <Field label="Notes" field="notes" placeholder="Notes..." />
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
              <Field label="Stamp" field="stamp" placeholder="e.g. Round Stamp Kafi" />
              <Field label="Signature Authority" field="signatureAuthority" placeholder="e.g. SKP & KMP" />
              <Field label="Mandate Holder" field="mandateHolder" placeholder="Enter if applicable" />
              <Field label="Maintain Balance" field="maintainBalance" placeholder="Enter if applicable" />
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
