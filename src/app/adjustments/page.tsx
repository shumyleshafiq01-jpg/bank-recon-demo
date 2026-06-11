"use client";

import { useState } from "react";
import {
  ArrowLeft, Upload, FileText, Loader2,
  ChevronRight, X, SlidersHorizontal, ChevronDown, ChevronUp,
  Download, AlertTriangle, CircleCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type BankRow = { date: string; particulars: string; debit: number; credit: number };
type LedgerRow = { date: string; ref: string; doc: string; desc: string; debit: number; credit: number };
type Summary = {
  resolvedFromBank: number; resolvedFromLedger: number;
  bankUnresolvedCount: number; bankUnresolvedDR: string; bankUnresolvedCR: string;
  ledgerUnresolvedCount: number; ledgerUnresolvedDR: string; ledgerUnresolvedCR: string;
};
type Results = {
  bankTotal: number; ledgerTotal: number;
  module2BankMissing: number; module2LedgerMissing: number;
  resolvedCount: number;
  bankUnresolved: BankRow[]; ledgerUnresolved: LedgerRow[];
  summary: Summary;
};

const fmt = (n: number) =>
  n === 0 ? "" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdjustmentsPage() {
  const router = useRouter();
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [showBankUn, setShowBankUn] = useState(true);
  const [showLedgerUn, setShowLedgerUn] = useState(true);

  async function runAdjustments() {
    if (!bankFile || !ledgerFile) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const fd = new FormData();
      fd.append("bankFile", bankFile);
      fd.append("ledgerFile", ledgerFile);
      const res = await fetch("/api/adjustments", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResults(data);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setBankFile(null); setLedgerFile(null); setResults(null); setError("");
  }

  function downloadXLS() {
    if (!results) return;
    const wb = XLSX.utils.book_new();

    const bankRows = [
      ["Date", "Particulars", "Debit", "Credit"],
      ...results.bankUnresolved.map((r) => [r.date, r.particulars, r.debit || "", r.credit || ""]),
      ["TOTAL", "", results.bankUnresolved.reduce((s, r) => s + r.debit, 0), results.bankUnresolved.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(bankRows);
    ws1["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Bank Unresolved");

    const ledgerRows = [
      ["Date", "Ref", "Document #", "Description", "Debit", "Credit"],
      ...results.ledgerUnresolved.map((r) => [r.date, r.ref, r.doc, r.desc, r.debit || "", r.credit || ""]),
      ["TOTAL", "", "", "", results.ledgerUnresolved.reduce((s, r) => s + r.debit, 0), results.ledgerUnresolved.reduce((s, r) => s + r.credit, 0)],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ledgerRows);
    ws2["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Ledger Unresolved");

    XLSX.writeFile(wb, "Adjustments-Report.xlsx");
  }

  const ready = bankFile && ledgerFile && !loading;

  return (
    <div className="flex-1 flex flex-col h-screen">
      <header className="border-b border-border bg-surface/50 backdrop-blur px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/dashboard")} className="text-muted hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-warning/20 flex items-center justify-center">
          <SlidersHorizontal className="w-3.5 h-3.5 text-warning" />
        </div>
        <span className="text-sm font-bold text-foreground">Adjustments & Corrections</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">

          {/* Upload */}
          {!results && (
            <>
              <div className="bg-surface rounded-2xl border border-border p-5">
                <p className="text-sm text-muted">
                  This module goes beyond amount-only matching. It groups all entries by amount,
                  then pairs them by date (exact match, then within ±3 and ±7 days) to correctly
                  identify WHICH specific entry is missing when the same amount appears multiple times.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Bank Statement</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-auto">PDF</span>
                  </div>
                  {bankFile ? (
                    <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2 text-foreground min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate">{bankFile.name}</span>
                        <span className="text-xs text-muted shrink-0">({(bankFile.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => setBankFile(null)} className="text-muted hover:text-danger cursor-pointer shrink-0 ml-2"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="file" accept=".pdf" onChange={(e) => { setBankFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-primary/50 transition-colors">
                        <FileText className="w-6 h-6 text-primary mx-auto mb-2" />
                        <p className="text-xs font-medium text-foreground">Drop PDF here or click to browse</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-semibold text-foreground">Journal Ledger</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent ml-auto">XLS / CSV</span>
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
                      <input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => { setLedgerFile(e.target.files?.[0] ?? null); e.target.value = ""; }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="rounded-xl border-2 border-dashed border-border bg-background p-8 text-center hover:border-accent/50 transition-colors">
                        <FileText className="w-6 h-6 text-accent mx-auto mb-2" />
                        <p className="text-xs font-medium text-foreground">Drop XLS/CSV here or click to browse</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={runAdjustments} disabled={!ready}
                className="w-full flex items-center justify-center gap-2 bg-warning hover:bg-warning/80 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-xl transition-all cursor-pointer">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SlidersHorizontal className="w-4 h-4" />}
                {loading ? "Processing..." : "Run Adjustments & Corrections"}
              </button>
            </>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">{error}</div>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-surface rounded-xl border border-border p-4 text-center col-span-2 md:col-span-3">
                  <p className="text-xs text-muted">Module 2 flagged {results.module2BankMissing} bank + {results.module2LedgerMissing} ledger entries as missing (amount-only match)</p>
                </div>
                <div className="bg-surface rounded-xl border border-emerald-500/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Resolved by Date</p>
                  <p className="text-lg font-bold text-emerald-400">{results.resolvedCount}</p>
                  <p className="text-[10px] text-muted">{results.summary.resolvedFromBank} bank + {results.summary.resolvedFromLedger} ledger</p>
                </div>
                <div className="bg-surface rounded-xl border border-primary/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Bank Still Missing</p>
                  <p className="text-lg font-bold text-primary">{results.summary.bankUnresolvedCount}</p>
                </div>
                <div className="bg-surface rounded-xl border border-warning/30 p-4 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wide">Ledger Still Missing</p>
                  <p className="text-lg font-bold text-warning">{results.summary.ledgerUnresolvedCount}</p>
                </div>
              </div>

              {/* Resolved explanation */}
              {results.resolvedCount > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 flex items-start gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground">
                    <strong>{results.resolvedCount} entries</strong> that Module 2 flagged as missing were resolved
                    by date matching — the same amount existed on both sides but with different frequencies.
                    Date pairing identified the correct counterpart for each, leaving only genuinely unmatched entries below.
                  </div>
                </div>
              )}

              {/* Bank Unresolved */}
              <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button onClick={() => setShowBankUn(!showBankUn)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-light/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Bank Entries — Not in Ledger
                      <span className="ml-2 text-xs font-normal text-muted">({results.bankUnresolved.length} entries)</span>
                    </h3>
                  </div>
                  {showBankUn ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {showBankUn && results.bankUnresolved.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-primary/10 text-primary">
                          <th className="px-4 py-2.5 text-left font-semibold">#</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Particulars</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Debit</th>
                          <th className="px-4 py-2.5 text-right font-semibold">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.bankUnresolved.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-surface-light/20"}>
                            <td className="px-4 py-2 text-muted">{i + 1}</td>
                            <td className="px-4 py-2 text-muted whitespace-nowrap">{r.date}</td>
                            <td className="px-4 py-2 text-foreground">{r.particulars}</td>
                            <td className="px-4 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-4 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
                          </tr>
                        ))}
                        <tr className="bg-primary/5 font-semibold border-t border-border">
                          <td className="px-4 py-2.5 text-foreground" colSpan={3}>TOTAL ({results.bankUnresolved.length} entries)</td>
                          <td className="px-4 py-2.5 text-right text-red-400 font-mono">{results.summary.bankUnresolvedDR}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 font-mono">{results.summary.bankUnresolvedCR}</td>
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
                    <table className="w-full text-xs">
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
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.ref || "—"}</td>
                            <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.doc || "—"}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{r.desc}</td>
                            <td className="px-3 py-2 text-right text-red-400 font-mono">{fmt(r.debit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-400 font-mono">{fmt(r.credit)}</td>
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
                  className="flex-1 flex items-center justify-center gap-2 bg-warning hover:bg-warning/80 text-black font-semibold py-3 rounded-xl transition-all cursor-pointer">
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
