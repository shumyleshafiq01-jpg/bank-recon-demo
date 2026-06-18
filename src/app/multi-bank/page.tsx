"use client";

import { useState } from "react";
import {
  ArrowLeft, Upload, FileText, Loader2,
  ChevronRight, X, Building2, ChevronDown, ChevronUp,
  Download, AlertTriangle, CircleCheck, Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type BankRow = { date: string; particulars: string; debit: number; credit: number; source: string };
type LedgerRow = { date: string; ref: string; doc: string; desc: string; debit: number; credit: number };
type BankSource = { name: string; bank: string; count: number; error?: string };
type Summary = {
  resolvedFromBank: number; resolvedFromLedger: number;
  bankUnresolvedCount: number; bankUnresolvedDR: string; bankUnresolvedCR: string;
  ledgerUnresolvedCount: number; ledgerUnresolvedDR: string; ledgerUnresolvedCR: string;
};
type Results = {
  bankTotal: number; ledgerTotal: number;
  bankSources: BankSource[];
  warnings: string[];
  module2BankMissing: number; module2LedgerMissing: number;
  resolvedCount: number;
  bankUnresolved: BankRow[]; ledgerUnresolved: LedgerRow[];
  summary: Summary;
};

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BANK_OPTIONS = [
  { value: "", label: "Auto-detect" },
  { value: "ABL", label: "Allied Bank (ABL)" },
  { value: "HMB", label: "Habib Metropolitan (HMB)" },
  { value: "FAYSAL", label: "Faysal Bank" },
  { value: "SONERI", label: "Soneri Bank" },
] as const;

export default function MultiBankPage() {
  const router = useRouter();
  const [bankFiles, setBankFiles] = useState<File[]>([]);
  const [bankSelections, setBankSelections] = useState<Record<number, string>>({});
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [showBankUn, setShowBankUn] = useState(true);
  const [showLedgerUn, setShowLedgerUn] = useState(true);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [expandedDesc, setExpandedDesc] = useState<number | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [passwordPrompt, setPasswordPrompt] = useState<string[] | null>(null);
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});

  function addBankFiles(files: FileList | null) {
    if (!files) return;
    setBankFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removeBankFile(idx: number) {
    setBankFiles((prev) => prev.filter((_, i) => i !== idx));
    setBankSelections((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const n = parseInt(k);
        if (n < idx) next[n] = v;
        else if (n > idx) next[n - 1] = v;
      });
      return next;
    });
  }

  async function runAnalysis(extraPasswords?: Record<string, string>) {
    if (bankFiles.length === 0 || !ledgerFile) return;
    setLoading(true);
    setError("");
    setResults(null);
    setPasswordPrompt(null);
    const allPasswords = { ...passwords, ...(extraPasswords ?? {}) };
    try {
      const fd = new FormData();
      for (let i = 0; i < bankFiles.length; i++) {
        fd.append("bankFiles", bankFiles[i]);
        fd.append("bankTypes", bankSelections[i] ?? "");
      }
      fd.append("ledgerFile", ledgerFile);
      if (Object.keys(allPasswords).length > 0) {
        fd.append("passwords", JSON.stringify(allPasswords));
      }
      const res = await fetch("/api/multi-bank", { method: "POST", body: fd });
      const data = await res.json();
      if (data.passwordRequired) {
        setPasswordPrompt(data.files);
        setPasswordInputs({});
      } else if (data.error) {
        setError(data.error);
      } else {
        setResults(data);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function submitPasswords() {
    const newPasswords = { ...passwords, ...passwordInputs };
    setPasswords(newPasswords);
    setPasswordPrompt(null);
    runAnalysis(newPasswords);
  }

  function reset() {
    setBankFiles([]); setBankSelections({}); setLedgerFile(null); setResults(null); setError("");
  }

  function downloadXLS() {
    if (!results) return;
    const wb = XLSX.utils.book_new();

    const bankRows = [
      ["Date", "Particulars", "Bank / Source", "Debit", "Credit"],
      ...results.bankUnresolved.map((r) => [r.date, r.particulars, r.source, r.debit || "", r.credit || ""]),
      ["TOTAL", "", `${results.bankUnresolved.length} entries`, results.bankUnresolved.reduce((s, r) => s + r.debit, 0), results.bankUnresolved.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(bankRows);
    ws1["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Bank Unresolved");

    const ledgerRows = [
      ["Date", "Ref", "Document #", "Description", "Debit", "Credit"],
      ...results.ledgerUnresolved.map((r) => [r.date, r.ref, r.doc, r.desc, r.debit || "", r.credit || ""]),
      ["TOTAL", "", "", "", results.ledgerUnresolved.reduce((s, r) => s + r.debit, 0), results.ledgerUnresolved.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ledgerRows);
    ws2["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Ledger Unresolved");

    XLSX.writeFile(wb, "Multi-Bank-Adjustments-Report.xlsx");
  }

  const ready = bankFiles.length > 0 && ledgerFile && !loading;

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Building2 className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <span className="text-sm font-bold text-foreground">Multi-Bank Adjustments & Corrections</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">

          {/* Upload */}
          {!results && (
            <>
              <div className="bg-surface rounded-2xl border border-border p-5">
                <p className="text-sm text-muted">
                  Same date-aware matching as Module 3, but supports <strong className="text-foreground">multiple bank statements</strong> from different banks.
                  Upload bank statements as <strong className="text-foreground">PDF, XLS, XLSX, or CSV</strong>,
                  then <strong className="text-foreground">select the bank</strong> from the dropdown under each file.
                  Supported banks: ABL, Habib Metropolitan, Faysal, and Soneri.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bank files */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-semibold text-foreground">Bank Statements</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 ml-auto">PDF / XLS / CSV</span>
                  </div>

                  {bankFiles.length > 0 && (
                    <div className="space-y-3">
                      {bankFiles.map((f, i) => {
                        const sel = bankSelections[i] ?? "";
                        return (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2 text-sm">
                              <div className="flex items-center gap-2 text-foreground min-w-0">
                                <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                                <span className="truncate">{f.name}</span>
                                <span className="text-xs text-muted shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                              </div>
                              <button onClick={() => removeBankFile(i)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="flex items-center gap-2 px-1">
                              <Building2 className="w-3 h-3 text-muted shrink-0" />
                              <select
                                value={sel}
                                onChange={(e) => setBankSelections((prev) => ({ ...prev, [i]: e.target.value }))}
                                className="flex-1 text-xs bg-background border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-violet-500/50 cursor-pointer"
                              >
                                {BANK_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="relative">
                    <input type="file" accept=".pdf,.xls,.xlsx,.csv" multiple onChange={(e) => { addBankFiles(e.target.files); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="rounded-xl border-2 border-dashed border-border bg-background p-6 text-center hover:border-violet-500/50 transition-colors">
                      <Plus className="w-5 h-5 text-violet-400 mx-auto mb-1.5" />
                      <p className="text-xs font-medium text-foreground">
                        {bankFiles.length === 0 ? "Drop bank statements here or click to browse" : "Add more bank statements"}
                      </p>
                      <p className="text-[10px] text-muted mt-1">Supports ABL, Habib Metropolitan, Faysal, and Soneri</p>
                    </div>
                  </div>
                </div>

                {/* Ledger */}
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-semibold text-foreground">Journal Ledger</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent ml-auto">XLS / CSV / PDF (Tally)</span>
                  </div>
                  {ledgerFile ? (
                    <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 text-foreground min-w-0">
                        <FileText className="w-4 h-4 text-accent shrink-0" />
                        <span className="truncate">{ledgerFile.name}</span>
                        <span className="text-xs text-muted shrink-0">({(ledgerFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => setLedgerFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="file" accept=".xls,.xlsx,.csv,.pdf" onChange={(e) => { setLedgerFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-accent/50 transition-colors">
                        <FileText className="w-6 h-6 text-accent mx-auto mb-2" />
                        <p className="text-xs font-medium text-foreground">Drop XLS/CSV/PDF here or click to browse</p>
                        <p className="text-[10px] text-muted mt-1">PDF must be Tally format</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button onClick={() => runAnalysis()} disabled={!ready}
                className="w-full flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-500/80 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                {loading ? "Processing..." : `Analyze ${bankFiles.length} Bank Statement${bankFiles.length !== 1 ? "s" : ""} vs Ledger`}
              </button>
            </>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">{error}</div>
          )}

          {/* Password Prompt */}
          {passwordPrompt && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <p className="text-sm font-semibold text-amber-300">Password Required</p>
              </div>
              <p className="text-sm text-muted">The following files are password-protected. Enter the password to unlock:</p>
              {passwordPrompt.map((fileName) => (
                <div key={fileName} className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-foreground min-w-0 truncate flex-1">{fileName}</span>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={passwordInputs[fileName] ?? ""}
                    onChange={(e) => setPasswordInputs((prev) => ({ ...prev, [fileName]: e.target.value }))}
                    className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50 w-48"
                    onKeyDown={(e) => e.key === "Enter" && submitPasswords()}
                  />
                </div>
              ))}
              <button
                onClick={submitPasswords}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 px-6 rounded-xl transition-all"
              >
                Unlock & Retry
              </button>
            </div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Warnings */}
              {results.warnings && results.warnings.length > 0 && (
                <div className="space-y-2">
                  {results.warnings.map((w, i) => (
                    <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Bank sources summary */}
              <div className="bg-surface rounded-2xl border border-border p-5">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Bank Statements Processed</h3>
                <div className="space-y-2">
                  {results.bankSources.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-foreground">{s.bank}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.error ? (
                          <span className="text-xs text-danger">Failed</span>
                        ) : (
                          <span className="text-xs text-muted">{s.count} entries</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                  <span className="text-foreground">Total Bank Entries</span>
                  <span className="text-violet-400">{results.bankTotal}</span>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-surface rounded-xl border border-border p-4 text-center col-span-2 md:col-span-3">
                  <p className="text-xs text-muted">Amount-only match flagged {results.module2BankMissing} bank + {results.module2LedgerMissing} ledger entries as missing</p>
                </div>
                <div className="bg-surface rounded-xl border border-emerald-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Resolved by Date</p>
                  <p className="text-lg font-bold text-emerald-400">{results.resolvedCount}</p>
                  <p className="text-[10px] text-muted">{results.summary.resolvedFromBank} bank + {results.summary.resolvedFromLedger} ledger</p>
                </div>
                <div className="bg-surface rounded-xl border border-violet-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Bank Still Missing</p>
                  <p className="text-lg font-bold text-violet-400">{results.summary.bankUnresolvedCount}</p>
                </div>
                <div className="bg-surface rounded-xl border border-warning/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Ledger Still Missing</p>
                  <p className="text-lg font-bold text-warning">{results.summary.ledgerUnresolvedCount}</p>
                </div>
              </div>

              {results.resolvedCount > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground">
                    <strong>{results.resolvedCount} entries</strong> that amount-only matching flagged as missing were resolved
                    by date pairing — the same amount existed on both sides with different frequencies.
                  </div>
                </div>
              )}

              {/* Bank Unresolved */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowBankUn(!showBankUn)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Bank Entries — Not in Ledger
                      <span className="ml-2 text-xs font-normal text-muted">({results.bankUnresolved.length} entries)</span>
                    </h3>
                  </div>
                  {showBankUn ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showBankUn && results.bankUnresolved.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col className="w-[40px]" />
                        <col className="w-[90px]" />
                        <col />
                        <col className="w-[80px]" />
                        <col className="w-[110px]" />
                        <col className="w-[110px]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-violet-500/10 text-violet-400">
                          <th className="px-3 py-2.5 text-left font-semibold">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Particulars</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Bank</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.bankUnresolved.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-foreground truncate" title={r.particulars}>{r.particulars}</td>
                            <td className="px-3 py-2 text-violet-400 text-xs truncate">{r.source}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap">{fmt(r.debit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-mono whitespace-nowrap">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-violet-500/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5 text-foreground" colSpan={4}>TOTAL ({results.bankUnresolved.length} entries)</td>
                          <td className="px-3 py-2.5 text-right text-red-400 font-mono">{results.summary.bankUnresolvedDR}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400 font-mono">{results.summary.bankUnresolvedCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {showBankUn && results.bankUnresolved.length === 0 && (
                  <div className="px-5 pb-4 text-sm text-emerald-400">All bank entries accounted for.</div>
                )}
              </div>

              {/* Ledger Unresolved */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowLedgerUn(!showLedgerUn)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Ledger Entries — Not in Bank
                      <span className="ml-2 text-xs font-normal text-muted">({results.ledgerUnresolved.length} entries)</span>
                    </h3>
                  </div>
                  {showLedgerUn ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showLedgerUn && results.ledgerUnresolved.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col className="w-[40px]" />
                        <col className="w-[80px]" />
                        <col className="w-[70px]" />
                        <col />
                        <col className="w-[200px]" />
                        <col className="w-[110px]" />
                        <col className="w-[110px]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-warning/10 text-warning">
                          <th className="px-3 py-2.5 text-left font-semibold">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Ref</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Doc #</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.ledgerUnresolved.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-3 py-2 text-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-foreground truncate">{r.ref || "—"}</td>
                            <td className="px-3 py-2 text-foreground">
                              {r.doc ? (
                                <button
                                  onClick={() => setExpandedDoc(expandedDoc === i ? null : i)}
                                  className={`text-left cursor-pointer hover:text-violet-400 transition-colors ${expandedDoc === i ? "whitespace-normal break-all" : "truncate block w-full"}`}
                                  title={r.doc}
                                >
                                  {r.doc}
                                </button>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {r.desc ? (
                                <button
                                  onClick={() => setExpandedDesc(expandedDesc === i ? null : i)}
                                  className={`text-left cursor-pointer hover:text-violet-400 transition-colors ${expandedDesc === i ? "whitespace-normal break-all" : "truncate block w-full"}`}
                                  title={r.desc}
                                >
                                  {r.desc}
                                </button>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono whitespace-nowrap">{fmt(r.debit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-mono whitespace-nowrap">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-warning/5 font-semibold border-t border-border">
                          <td className="px-3 py-2.5 text-foreground" colSpan={5}>TOTAL ({results.ledgerUnresolved.length} entries)</td>
                          <td className="px-3 py-2.5 text-right text-red-400 font-mono">{results.summary.ledgerUnresolvedDR}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-400 font-mono">{results.summary.ledgerUnresolvedCR}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                {showLedgerUn && results.ledgerUnresolved.length === 0 && (
                  <div className="px-5 pb-4 text-sm text-emerald-400">All ledger entries accounted for.</div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={downloadXLS}
                  className="flex-1 flex items-center justify-center gap-2 bg-violet-500 hover:bg-violet-500/80 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer">
                  <Download className="w-4 h-4" />
                  Download XLS
                </button>
                <button onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface hover:bg-surface-light border border-border text-foreground font-semibold py-3 rounded-xl transition-all cursor-pointer">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Start Over
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
